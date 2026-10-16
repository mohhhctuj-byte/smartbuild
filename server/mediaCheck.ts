import type { Express, Request, Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import {
  MEDIA_CHECK_LIMITS,
  MEDIA_CHECK_MAX_IMAGE_BYTES,
  MEDIA_CHECK_MAX_VIDEO_BYTES,
  MEDIA_CHECK_RESPONSE_LANGUAGES,
  type MediaCheckResponseLanguage,
} from "@shared/mediaCheck";
import { analyzeGeminiMedia, type MediaCheckUnderstanding, verifyGeminiProvider } from "./llmStream";
import { isMediaProvenanceVerifierReady, type MediaProvenanceCheck, verifyMediaProvenance } from "./mediaProvenance";
import { validateMediaCheckFile } from "./mediaCheckValidation";

const JOB_TTL_MS = 15 * 60_000;
const MAX_ACTIVE_JOBS = 4;
const LIMITATION = "Gemini's AI-generation estimate is an uncalibrated visual impression and can be mistaken; it is not proof of authenticity or how media was created.";

export type MediaCheckResult = {
  jobId: string;
  status: "completed";
  mediaType: "image" | "video";
  contentUnderstanding: {
    status: "completed";
    provider: MediaCheckUnderstanding["provider"];
    model: string;
    responseLanguage: MediaCheckResponseLanguage;
    summary: string;
    observations: string[];
    timestampFindings: Array<{ timestamp: string; description: string }>;
    reviewPasses: MediaCheckUnderstanding["reviewPasses"];
    aiGenerationEstimate: MediaCheckUnderstanding["aiGenerationEstimate"];
    providerFileCleanup: MediaCheckUnderstanding["providerFileCleanup"];
  };
  authenticity: {
    status: "inconclusive";
    summary: string;
    checks: MediaProvenanceCheck[];
  };
  limitations: string[];
};

type MediaCheckJob = {
  jobId: string;
  userId: number;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: number;
  expiresAt: number;
  result?: MediaCheckResult;
  error?: { code: string; message: string; retryable: boolean };
};

type AuthenticatedRequest = Request & { mediaCheckUserId?: number };

type Dependencies = {
  requireAccount: (req: Request, res: Response) => Promise<{ id: number } | null>;
  verifyProvider: () => Promise<{ state: "Ready" | "Blocked"; reason: string; model?: string }>;
  analyze: (
    bytes: Buffer,
    mimeType: string,
    model: string,
    options: { responseLanguage: MediaCheckResponseLanguage; question?: string; durationSeconds?: number },
  ) => Promise<MediaCheckUnderstanding>;
  checkProvenance: typeof verifyMediaProvenance;
  provenanceVerifierReady: typeof isMediaProvenanceVerifierReady;
};

const jobs = new Map<string, MediaCheckJob>();
const activeUsers = new Set<number>();

function pruneExpiredState(now = Date.now()) {
  for (const [jobId, job] of Array.from(jobs.entries())) if (job.expiresAt <= now) jobs.delete(jobId);
}

const cleanupInterval = setInterval(pruneExpiredState, 60_000);
cleanupInterval.unref();

function publicValidationError(code: string) {
  const errors: Record<string, { status: number; message: string }> = {
    unsupported_type: { status: 415, message: "This media format is not supported. Choose a JPEG, PNG, WebP, or MP4 file." },
    type_mismatch: { status: 415, message: "The file contents do not match the declared media type." },
    too_large: { status: 413, message: "This file is larger than the supported size limit." },
    empty: { status: 400, message: "The selected media file is empty." },
    invalid_media: { status: 422, message: "The media file is invalid or could not be read." },
    duration_exceeded: { status: 422, message: "This video must be shorter than 10 minutes." },
    dimensions_exceeded: { status: 422, message: "The media dimensions exceed the supported limits." },
  };
  return errors[code] || { status: 422, message: "The selected media could not be processed." };
}

function matchesMediaExtension(fileName: string, mimeType: string) {
  const extension = fileName.split(/[\\/]/).pop()?.match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toLowerCase();
  const allowedExtensions: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/gif": ["gif"],
    "video/mp4": ["mp4"],
  };
  return Boolean(extension && allowedExtensions[mimeType]?.includes(extension));
}

function providerFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "GEMINI_MEDIA_TIMEOUT") {
    return { code: "ANALYSIS_TIMEOUT", message: "Gemini analysis timed out. The selected file remains available; try again shortly.", retryable: true };
  }
  if (code === "GEMINI_MEDIA_NOT_CONFIGURED" || code === "GEMINI_MEDIA_UNAVAILABLE"
    || ["GEMINI_MEDIA_HTTP_401", "GEMINI_MEDIA_HTTP_403", "GEMINI_MEDIA_HTTP_404"].includes(code)) {
    return { code: "ANALYSIS_UNAVAILABLE", message: "Gemini is unavailable or its server API key needs attention. No analysis result was produced.", retryable: false };
  }
  if (code === "GEMINI_MEDIA_HTTP_429") {
    return { code: "ANALYSIS_RATE_LIMITED", message: "Gemini is temporarily rate-limiting media analysis. Try again later.", retryable: true };
  }
  if (code === "GEMINI_MEDIA_INVALID_RESPONSE" || code === "GEMINI_MEDIA_PROCESSING_FAILED") {
    return { code: "ANALYSIS_FAILED", message: "Gemini did not return a usable analysis result.", retryable: true };
  }
  if (code.startsWith("GEMINI_MEDIA_HTTP_")) {
    return { code: "ANALYSIS_FAILED", message: "Gemini could not complete this media-analysis request.", retryable: true };
  }
  return { code: "ANALYSIS_FAILED", message: "Content analysis could not be completed. No result was produced.", retryable: true };
}

function attachJobResult(
  job: MediaCheckJob,
  mediaType: "image" | "video",
  response: MediaCheckUnderstanding,
  provenanceCheck: MediaProvenanceCheck,
  responseLanguage: MediaCheckResponseLanguage,
) {
  job.status = "completed";
  job.result = {
    jobId: job.jobId,
    status: "completed",
    mediaType,
    contentUnderstanding: {
      status: "completed",
      provider: response.provider,
      model: response.model,
      responseLanguage,
      summary: response.summary,
      observations: response.observations,
      timestampFindings: mediaType === "video" ? response.timestampFindings : [],
      reviewPasses: response.reviewPasses,
      aiGenerationEstimate: response.aiGenerationEstimate,
      providerFileCleanup: response.providerFileCleanup,
    },
    authenticity: {
      status: "inconclusive",
      summary: "Gemini provides a visual AI-generation estimate, while C2PA checks signed provenance separately. Neither establishes that depicted events are true.",
      checks: [provenanceCheck],
    },
    limitations: [LIMITATION],
  };
}

export function registerMediaCheckRoutes(app: Express, dependencies: Dependencies) {
  const storage: multer.StorageEngine = {
    _handleFile(_req, file, callback) {
      const maxBytes = file.mimetype === "video/mp4" ? MEDIA_CHECK_MAX_VIDEO_BYTES : MEDIA_CHECK_MAX_IMAGE_BYTES;
      const chunks: Buffer[] = [];
      let size = 0;
      let rejected = false;
      let callbackCalled = false;
      const complete = (error: Error | null, info?: Partial<Express.Multer.File>) => {
        if (callbackCalled) return;
        callbackCalled = true;
        callback(error, info);
      };
      file.stream.on("data", (chunk: Buffer) => {
        if (rejected) return;
        size += chunk.length;
        if (size > maxBytes) {
          rejected = true;
          chunks.length = 0;
          complete(new multer.MulterError("LIMIT_FILE_SIZE", file.fieldname));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      file.stream.once("error", error => complete(error));
      file.stream.once("end", () => {
        if (!rejected) complete(null, { buffer: Buffer.concat(chunks, size), size });
      });
    },
    _removeFile(_req, file, callback) {
      file.buffer = Buffer.alloc(0);
      callback(null);
    },
  };
  const parseMedia = multer({
    storage,
    limits: { fileSize: MEDIA_CHECK_MAX_VIDEO_BYTES, files: 1, fields: 4, parts: 5, fieldSize: 2048 },
  }).single("media");

  app.get("/api/media-check/config", async (_req, res) => {
    const [verification, provenanceReady] = await Promise.all([
      dependencies.verifyProvider(),
      dependencies.provenanceVerifierReady(),
    ]);
    const ready = verification.state === "Ready";
    const model = ready ? verification.model : null;
    res.setHeader("Cache-Control", "no-store");
    res.json({
      contentUnderstanding: { ready, provider: ready ? "Google Gemini API" : null, model },
      provenance: {
        connected: provenanceReady,
        provider: provenanceReady ? "C2PA Content Credentials verifier" : null,
        mediaTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
      },
      limits: MEDIA_CHECK_LIMITS,
      providerDisclosure: "After you confirm, each selected image (up to 5) or single video is uploaded to the Google Gemini API for 2–4 separate visual reviews. The upload is deleted after analysis when supported; otherwise Google's file-retention policy applies. Gemini API quotas and rate limits apply.",
    });
  });

  const requireAccountAndParseBody = async (req: AuthenticatedRequest, res: Response, next: (error?: unknown) => void) => {
    let account: { id: number } | null;
    try {
      account = await dependencies.requireAccount(req, res);
    } catch {
      res.status(503).json({ code: "AUTHENTICATION_UNAVAILABLE", error: "Authentication could not be verified. No media was analyzed." });
      return;
    }
    if (!account) return;
    req.mediaCheckUserId = account.id;
    pruneExpiredState();
    if (activeUsers.has(account.id)) {
      res.status(409).json({ code: "ANALYSIS_IN_PROGRESS", error: "One content-analysis request is already running for this account." });
      return;
    }
    if (activeUsers.size >= MAX_ACTIVE_JOBS) {
      res.status(429).json({ code: "ANALYSIS_BUSY", error: "Content analysis is busy. Try again shortly." });
      return;
    }
    activeUsers.add(account.id);
    parseMedia(req, res, error => {
      if (error) {
        activeUsers.delete(account.id);
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ code: "MEDIA_TOO_LARGE", error: "This file is larger than the supported size limit." });
          return;
        }
        if (error instanceof multer.MulterError && error.code === "LIMIT_UNEXPECTED_FILE") {
          res.status(400).json({ code: "INVALID_MEDIA_FIELD", error: "Include one media file in the media field." });
          return;
        }
        res.status(400).json({ code: "INVALID_REQUEST", error: "The media request could not be read." });
        return;
      }
      next();
    });
  };

  app.post("/api/media-check", (req, res, next) => {
    void requireAccountAndParseBody(req as AuthenticatedRequest, res, next);
  }, async (req: AuthenticatedRequest, res) => {
    const userId = req.mediaCheckUserId;
    const bytes = req.file?.buffer || Buffer.alloc(0);
    if (!userId) return res.status(401).json({ code: "AUTHENTICATION_REQUIRED", error: "Sign in with a verified SmartBuild account to analyze media." });
    if (!req.file) {
      activeUsers.delete(userId);
      return res.status(400).json({ code: "MEDIA_REQUIRED", error: "Include one image or video in the media field." });
    }
    const formFields = Object.keys(req.body || {});
    const responseLanguageValue = req.body?.responseLanguage;
    const questionValue = req.body?.question;
    const responseLanguage = MEDIA_CHECK_RESPONSE_LANGUAGES
      .find(language => language.value === responseLanguageValue)?.value;
    if (formFields.some(field => !["analysisMode", "responseLanguage", "question"].includes(field))
      || (req.body?.analysisMode !== undefined && req.body.analysisMode !== "content_understanding")
      || (responseLanguageValue !== undefined && !responseLanguage)
      || (questionValue !== undefined && (typeof questionValue !== "string" || questionValue.length > 500))) {
      activeUsers.delete(userId);
      req.file.buffer.fill(0);
      return res.status(400).json({ code: "INVALID_ANALYSIS_OPTIONS", error: "Choose a supported result language and a question of no more than 500 characters." });
    }
    const requestedLanguage = responseLanguage || "Arabic";
    const question = typeof questionValue === "string" ? questionValue.trim() : "";
    if (!matchesMediaExtension(req.file.originalname, req.file.mimetype)) {
      activeUsers.delete(userId);
      req.file.buffer.fill(0);
      return res.status(415).json({ code: "MEDIA_EXTENSION_MISMATCH", error: "The file extension does not match the selected media type." });
    }
    const validation = validateMediaCheckFile(bytes, req.file.mimetype);
    if ("error" in validation) {
      activeUsers.delete(userId);
      bytes.fill(0);
      const failure = publicValidationError(validation.error);
      return res.status(failure.status).json({ code: validation.error.toUpperCase(), error: failure.message });
    }

    let verification: Awaited<ReturnType<Dependencies["verifyProvider"]>>;
    try {
      verification = await dependencies.verifyProvider();
    } catch {
      activeUsers.delete(userId);
      bytes.fill(0);
      return res.status(503).json({ code: "ANALYSIS_UNAVAILABLE", error: "Content analysis is currently unavailable. No result was produced." });
    }
    if (verification.state !== "Ready" || !verification.model) {
      activeUsers.delete(userId);
      bytes.fill(0);
      return res.status(503).json({ code: "ANALYSIS_UNAVAILABLE", error: "Content analysis is currently unavailable. No result was produced." });
    }
    const model = verification.model;

    const jobId = crypto.randomUUID();
    const job: MediaCheckJob = {
      jobId,
      userId,
      status: "queued",
      createdAt: Date.now(),
      expiresAt: Date.now() + JOB_TTL_MS,
    };
    jobs.set(jobId, job);
    const mediaBytes = Buffer.from(bytes);
    void (async () => {
      job.status = "processing";
      try {
        const [response, provenanceCheck] = await Promise.all([
          dependencies.analyze(mediaBytes, validation.media.mimeType, model, {
            responseLanguage: requestedLanguage,
            ...(validation.media.durationSeconds ? { durationSeconds: validation.media.durationSeconds } : {}),
            ...(question ? { question } : {}),
          }),
          dependencies.checkProvenance(mediaBytes, validation.media.mimeType),
        ]);
        if (job.expiresAt > Date.now()) attachJobResult(job, validation.media.mediaType, response, provenanceCheck, requestedLanguage);
      } catch (error) {
        if (job.expiresAt > Date.now()) {
          job.status = "failed";
          job.error = providerFailure(error);
        }
      } finally {
        activeUsers.delete(userId);
        mediaBytes.fill(0);
      }
    })();
    bytes.fill(0);
    req.file.buffer = Buffer.alloc(0);

    res.status(202).json({ jobId, status: "queued" });
  });

  app.get("/api/media-check/:jobId", async (req, res) => {
    let account: { id: number } | null;
    try {
      account = await dependencies.requireAccount(req, res);
    } catch {
      return res.status(503).json({ code: "AUTHENTICATION_UNAVAILABLE", error: "Authentication could not be verified." });
    }
    if (!account) return;
    const job = jobs.get(req.params.jobId);
    if (!job || job.expiresAt <= Date.now()) {
      if (job) jobs.delete(job.jobId);
      return res.status(410).json({ code: "JOB_EXPIRED", error: "This analysis result expired. Start a new request if you still have the file." });
    }
    if (job.userId !== account.id) return res.status(404).json({ code: "JOB_NOT_FOUND", error: "This analysis request is not available." });
    res.setHeader("Cache-Control", "no-store");
    res.json({
      jobId: job.jobId,
      status: job.status,
      ...(job.result ? { result: job.result } : {}),
      ...(job.error ? { error: job.error } : {}),
    });
  });
}
