import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileImage, ImagePlus, LockKeyhole, LoaderCircle, ScanSearch, Video, X } from "lucide-react";
import {
  MEDIA_CHECK_ANALYSIS_IMAGE_TYPES,
  MEDIA_CHECK_LIMITS,
  MEDIA_CHECK_MAX_IMAGE_BYTES,
  MEDIA_CHECK_MAX_IMAGE_BATCH,
  MEDIA_CHECK_MAX_IMAGE_EDGE,
  MEDIA_CHECK_MAX_IMAGE_PIXELS,
  MEDIA_CHECK_MAX_VIDEO_BYTES,
  MEDIA_CHECK_MAX_VIDEO_HEIGHT,
  MEDIA_CHECK_MAX_VIDEO_SECONDS,
  MEDIA_CHECK_MAX_VIDEO_WIDTH,
  MEDIA_CHECK_RESPONSE_LANGUAGES,
  MEDIA_CHECK_VIDEO_TYPES,
  detectMediaCheckResponseLanguage,
  isMediaCheckVideoDimensionsSupported,
  type MediaCheckResponseLanguage,
} from "@shared/mediaCheck";
import {
  AI_IMAGE_CHECK_ACCEPTED_TYPES,
  AI_IMAGE_CHECK_MAX_BYTES,
  formatAiImageCheckFileSize,
  validateAiImageCheckFile,
} from "@/lib/aiImageCheck";

type Props = {
  onAskAboutImage: (prompt: string) => void;
};

type Selection = {
  id: string;
  file: File;
  previewUrl: string;
  mediaType: "image" | "video";
  durationSeconds?: number;
};

type BatchResult = { selectionId: string; fileName: string; result: ContentResult };

type ContentResult = {
  jobId: string;
  status: "completed";
  mediaType: "image" | "video";
  contentUnderstanding: {
    status: "completed";
    provider: string;
    model: string;
    responseLanguage: MediaCheckResponseLanguage;
    summary: string;
    observations: string[];
    timestampFindings: Array<{ timestamp: string; description: string }>;
    reviewPasses: Array<{
      method: string;
      aiGeneratedLikelihoodPercent: number;
      selfAssessedConfidencePercent: number;
      explanation: string;
    }>;
    aiGenerationEstimate: { aiGeneratedLikelihoodPercent: number; explanation: string };
    providerFileCleanup: "deleted" | "automatic_expiry" | "local";
  };
  authenticity: {
    status: "inconclusive";
    summary: string;
    checks: Array<{
      id: "c2pa_provenance";
      status: "verified" | "present_unverified" | "not_found" | "invalid" | "unavailable" | "failed";
      summary: string;
    }>;
  };
  limitations: string[];
};

type ProviderConfig = {
  contentUnderstanding: { ready: boolean; provider: string | null; model: string | null };
  provenance: { connected: boolean; provider: string | null; mediaTypes: string[] };
  limits: typeof MEDIA_CHECK_LIMITS;
  providerDisclosure: string;
};

type AnalysisState =
  | { status: "idle" }
  | { status: "submitting" | "queued" | "processing" }
  | { status: "failed"; message: string; retryable: boolean }
  | { status: "completed"; result: ContentResult };

type FileError =
  | "unsupported" | "type-mismatch" | "too-large" | "empty" | "unreadable"
  | "preview" | "invalid-media" | "duration" | "dimensions" | "timeout" | "unsupported-codec" | "decode-failed"
  | "batch-limit" | "mixed-media";

const delay = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));
const previewTypes = [...AI_IMAGE_CHECK_ACCEPTED_TYPES, ...MEDIA_CHECK_VIDEO_TYPES];

export async function inspectVideo(previewUrl: string) {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  try {
    return await new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("loadeddata", onLoadedData);
        video.removeEventListener("error", onError);
        video.removeEventListener("abort", onAbort);
      };
      const finish = (callback: () => void) => {
        cleanup();
        callback();
      };
      const timeout = window.setTimeout(() => finish(() => reject(new Error("timeout"))), 15_000);
      const readMetadata = (hasCurrentFrame: boolean) => {
        const metadata = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
        if (!Number.isFinite(metadata.duration) || metadata.duration <= 0) {
          finish(() => reject(new Error("unreadable")));
        } else if (metadata.duration >= MEDIA_CHECK_MAX_VIDEO_SECONDS) {
          finish(() => reject(new Error("duration")));
        } else if (metadata.width <= 0 || metadata.height <= 0) {
          if (!hasCurrentFrame) return;
          finish(() => reject(new Error("unreadable")));
        } else if (!isMediaCheckVideoDimensionsSupported(metadata.width, metadata.height)) {
          finish(() => reject(new Error("dimensions")));
        } else if (!hasCurrentFrame) {
          return;
        } else {
          finish(() => resolve(metadata));
        }
      };
      const onLoadedMetadata = () => readMetadata(false);
      const onLoadedData = () => readMetadata(true);
      const onError = () => {
        const errorCode = video.error?.code;
        const failure = errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? "unsupported-codec"
          : errorCode === MediaError.MEDIA_ERR_DECODE
            ? "decode-failed"
            : "unreadable";
        finish(() => reject(new Error(failure)));
      };
      const onAbort = () => finish(() => reject(new Error("unreadable")));

      video.addEventListener("loadedmetadata", onLoadedMetadata);
      video.addEventListener("loadeddata", onLoadedData);
      video.addEventListener("error", onError);
      video.addEventListener("abort", onAbort);
      video.src = previewUrl;
      video.load();
    });
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

function isContentResult(value: unknown): value is ContentResult {
  if (!value || typeof value !== "object") return false;
  const result = value as ContentResult;
  const estimate = result.contentUnderstanding?.aiGenerationEstimate;
  return result.status === "completed"
    && (result.mediaType === "image" || result.mediaType === "video")
    && result.contentUnderstanding?.status === "completed"
    && typeof result.contentUnderstanding.summary === "string"
    && typeof estimate?.aiGeneratedLikelihoodPercent === "number"
    && Number.isInteger(estimate.aiGeneratedLikelihoodPercent)
    && estimate.aiGeneratedLikelihoodPercent >= 0
    && estimate.aiGeneratedLikelihoodPercent <= 100
    && typeof estimate.explanation === "string"
    && estimate.explanation.length > 0
    && typeof result.contentUnderstanding.provider === "string"
    && typeof result.contentUnderstanding.model === "string"
    && MEDIA_CHECK_RESPONSE_LANGUAGES.some(language => language.value === result.contentUnderstanding.responseLanguage)
    && Array.isArray(result.contentUnderstanding.observations)
    && result.contentUnderstanding.observations.every(item => typeof item === "string")
    && Array.isArray(result.contentUnderstanding.timestampFindings)
    && result.contentUnderstanding.timestampFindings.every(item => item
      && typeof item.timestamp === "string" && typeof item.description === "string")
    && Array.isArray(result.contentUnderstanding.reviewPasses)
    && result.contentUnderstanding.reviewPasses.length >= 2
    && result.contentUnderstanding.reviewPasses.length <= 4
    && result.contentUnderstanding.reviewPasses.every(pass => pass
      && typeof pass.method === "string"
      && Number.isInteger(pass.aiGeneratedLikelihoodPercent)
      && pass.aiGeneratedLikelihoodPercent >= 0 && pass.aiGeneratedLikelihoodPercent <= 100
      && Number.isInteger(pass.selfAssessedConfidencePercent)
      && pass.selfAssessedConfidencePercent >= 0 && pass.selfAssessedConfidencePercent <= 100
      && typeof pass.explanation === "string")
    && ["deleted", "automatic_expiry", "local"].includes(result.contentUnderstanding.providerFileCleanup)
    && result.authenticity?.status === "inconclusive"
    && typeof result.authenticity.summary === "string"
    && Array.isArray(result.authenticity.checks)
    && result.authenticity.checks.every(check => check
      && check.id === "c2pa_provenance"
      && ["verified", "present_unverified", "not_found", "invalid", "unavailable", "failed"].includes(check.status)
      && typeof check.summary === "string")
    && Array.isArray(result.limitations);
}

export function AIImageCheckEntry({ onAskAboutImage }: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<Selection[]>([]);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number } | null>(null);
  const [fileError, setFileError] = useState<FileError | null>(null);
  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [retryingProvider, setRetryingProvider] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
  const [analysisConfirmationPending, setAnalysisConfirmationPending] = useState(false);
  const [question, setQuestion] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectionId = useRef(0);
  const analysisId = useRef(0);
  const previewUrlRef = useRef<string[]>([]);
  const responseLanguage = detectMediaCheckResponseLanguage(question);

  useEffect(() => {
    let active = true;
    void fetch("/api/media-check/config", { credentials: "same-origin" })
      .then(async response => {
        if (!response.ok) throw new Error("provider unavailable");
        return await response.json() as ProviderConfig;
      })
      .then(config => {
        if (active) setProviderConfig(config);
      })
      .catch(() => {
        if (active) setProviderUnavailable(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    return () => {
      selectionId.current += 1;
      analysisId.current += 1;
      previewUrlRef.current.forEach(url => URL.revokeObjectURL(url));
      previewUrlRef.current = [];
    };
  }, []);

  useEffect(() => {
    const handlePastedImage = (event: Event) => {
      const files = (event as CustomEvent<File[]>).detail;
      if (files?.length) void selectFiles(files);
    };
    window.addEventListener("smartbuild:ai-image-check-paste", handlePastedImage);
    return () => window.removeEventListener("smartbuild:ai-image-check-paste", handlePastedImage);
  }, []);

  const retryProviderConnection = async () => {
    setRetryingProvider(true);
    setProviderUnavailable(false);
    try {
      const response = await fetch("/api/media-check/config", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("provider unavailable");
      setProviderConfig(await response.json() as ProviderConfig);
    } catch {
      setProviderConfig(null);
      setProviderUnavailable(true);
    } finally {
      setRetryingProvider(false);
    }
  };

  const validateAndCreateSelection = async (file: File): Promise<Selection | null> => {
    let mediaType: Selection["mediaType"] | null = null;
    let error: FileError | null = null;
    let durationSeconds: number | undefined;

    if (AI_IMAGE_CHECK_ACCEPTED_TYPES.some(type => type === file.type)) {
      mediaType = "image";
      error = await validateAiImageCheckFile(file);
      if (!error && MEDIA_CHECK_ANALYSIS_IMAGE_TYPES.some(type => type === file.type)) {
        let bitmap: ImageBitmap | null = null;
        try {
          bitmap = await createImageBitmap(file);
          if (bitmap.width > MEDIA_CHECK_MAX_IMAGE_EDGE
            || bitmap.height > MEDIA_CHECK_MAX_IMAGE_EDGE
            || bitmap.width * bitmap.height > MEDIA_CHECK_MAX_IMAGE_PIXELS) error = "dimensions";
        } catch {
          error = "unreadable";
        } finally {
          bitmap?.close();
        }
      }
    } else if (MEDIA_CHECK_VIDEO_TYPES.some(type => type === file.type)) {
      mediaType = "video";
      if (file.size === 0) error = "empty";
      else if (file.size > MEDIA_CHECK_MAX_VIDEO_BYTES) error = "too-large";
      else {
        try {
          const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
          if (bytes.length < 12 || String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) !== "ftyp") error = "unsupported";
        } catch {
          error = "unreadable";
        }
      }
    } else {
      error = "unsupported";
    }

    if (!error && mediaType === "video") {
      let metadataUrl: string | null = null;
      try {
        metadataUrl = URL.createObjectURL(file);
        const metadata = await inspectVideo(metadataUrl);
        durationSeconds = metadata.duration;
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : "";
        error = reason === "duration" ? "duration"
          : reason === "dimensions" ? "dimensions"
            : reason === "timeout" ? "timeout"
              : reason === "unsupported-codec" ? "unsupported-codec"
                : "unreadable";
      } finally {
        if (metadataUrl) URL.revokeObjectURL(metadataUrl);
      }
    }

    if (error || !mediaType) {
      setFileError(error || "unsupported");
      return null;
    }

    let previewUrl: string;
    try {
      previewUrl = URL.createObjectURL(file);
    } catch {
      setFileError("preview");
      return null;
    }
    previewUrlRef.current.push(previewUrl);
    return { id: crypto.randomUUID(), file, previewUrl, mediaType, durationSeconds };
  };

  const selectFiles = async (files: FileList | File[]) => {
    const currentSelection = ++selectionId.current;
    const suppliedFiles = Array.from(files);
    const existingSelections = selectedBatch;
    if (existingSelections.length + suppliedFiles.length > MEDIA_CHECK_MAX_IMAGE_BATCH
      || (suppliedFiles.length + existingSelections.length > 1
        && [...existingSelections.map(item => item.file), ...suppliedFiles]
          .some(file => !MEDIA_CHECK_ANALYSIS_IMAGE_TYPES.includes(file.type as typeof MEDIA_CHECK_ANALYSIS_IMAGE_TYPES[number])))) {
      setFileError(existingSelections.length + suppliedFiles.length > MEDIA_CHECK_MAX_IMAGE_BATCH ? "batch-limit" : "mixed-media");
      return;
    }
    setValidating(true);
    setFileError(null);
    const validSelections: Selection[] = [];
    for (const file of suppliedFiles) {
      const next = await validateAndCreateSelection(file);
      if (currentSelection !== selectionId.current) {
        next && URL.revokeObjectURL(next.previewUrl);
        return;
      }
      if (next) validSelections.push(next);
    }
    setValidating(false);
    if (validSelections.length === 0) return;
    analysisId.current += 1;
    setAnalysisConfirmationPending(false);
    const nextBatch = [...existingSelections, ...validSelections];
    setSelectedBatch(nextBatch);
    setSelection(existingSelections[0] || validSelections[0]);
    if (existingSelections.length === 0) setBatchResults([]);
    setAnalysis({ status: "idle" });
  };

  const chooseFile = (files: FileList | null) => {
    if (files?.length) void selectFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelection = () => {
    selectionId.current += 1;
    analysisId.current += 1;
    previewUrlRef.current.forEach(url => URL.revokeObjectURL(url));
    previewUrlRef.current = [];
    setAnalysisConfirmationPending(false);
    setSelectedBatch([]);
    setBatchResults([]);
    setSelection(null);
    setValidating(false);
    setAnalysisProgress(null);
    setFileError(null);
    setAnalysis({ status: "idle" });
  };

  const failCurrentPreview = (previewUrl: string, error: FileError) => {
    if (!previewUrlRef.current.includes(previewUrl)) return;
    previewUrlRef.current = previewUrlRef.current.filter(url => url !== previewUrl);
    URL.revokeObjectURL(previewUrl);
    selectionId.current += 1;
    analysisId.current += 1;
    const remaining = selectedBatch.filter(item => item.previewUrl !== previewUrl);
    setSelectedBatch(remaining);
    setSelection(remaining[0] || null);
    setBatchResults([]);
    setValidating(false);
    setAnalysisProgress(null);
    setFileError(error);
    setAnalysis({ status: "idle" });
  };

  const confirmAnalysis = () => {
    if (!selection || !selectedBatch.some(item => item.file.type !== "image/gif") || !providerReady || activeAnalysis || validating) return;
    setAnalysisConfirmationPending(true);
  };

  const proceedWithAnalysis = () => {
    setAnalysisConfirmationPending(false);
    void startAnalysis();
  };

  const startAnalysis = async () => {
    const filesToAnalyze = selectedBatch.filter(item => item.file.type !== "image/gif");
    if (filesToAnalyze.length === 0 || !providerConfig?.contentUnderstanding.ready
      || ["submitting", "queued", "processing"].includes(analysis.status)) return;

    const currentAnalysis = ++analysisId.current;
    const pendingFiles = filesToAnalyze.filter(item => !batchResults.some(result => result.selectionId === item.id));
    setAnalysisProgress({ current: filesToAnalyze.length - pendingFiles.length, total: filesToAnalyze.length });
    for (let index = 0; index < pendingFiles.length; index += 1) {
      const currentSelection = pendingFiles[index];
      if (currentAnalysis !== analysisId.current) return;
      setAnalysisProgress({ current: filesToAnalyze.length - pendingFiles.length + index + 1, total: filesToAnalyze.length });
      setAnalysis({ status: "submitting" });
      try {
        const formData = new FormData();
        formData.append("media", currentSelection.file, currentSelection.file.name);
        formData.append("responseLanguage", responseLanguage);
        if (question.trim()) formData.append("question", question.trim());
        const response = await fetch("/api/media-check", {
          method: "POST",
          credentials: "same-origin",
          body: formData,
        });
        const responseBody = await response.json().catch(() => ({})) as {
          jobId?: unknown;
          status?: unknown;
          error?: unknown;
          code?: unknown;
        };
        if (!response.ok || typeof responseBody.jobId !== "string") {
          setAnalysisProgress(null);
          setAnalysis({
            status: "failed",
            message: typeof responseBody.error === "string" ? responseBody.error : "The request could not be started. No result was produced.",
            retryable: response.status === 429
              && responseBody.code === "ANALYSIS_BUSY",
          });
          return;
        }

        setAnalysis({ status: "queued" });
        for (;;) {
          await delay(1200);
          if (currentAnalysis !== analysisId.current) return;
          const statusResponse = await fetch(`/api/media-check/${encodeURIComponent(responseBody.jobId)}`, { credentials: "same-origin" });
          const statusBody = await statusResponse.json().catch(() => ({})) as {
            status?: unknown;
            result?: unknown;
            error?: { message?: unknown; retryable?: unknown };
          };
          if (statusResponse.status === 410) {
            setAnalysisProgress(null);
            setAnalysis({ status: "failed", message: "This analysis request expired. The selected file is still available.", retryable: false });
            return;
          }
          if (!statusResponse.ok) {
            setAnalysisProgress(null);
            setAnalysis({ status: "failed", message: "Connection to the analysis request was interrupted. No result is available.", retryable: false });
            return;
          }
          const completedResult = statusBody.result;
          if (statusBody.status === "completed" && isContentResult(completedResult)) {
            setBatchResults(current => [...current, { selectionId: currentSelection.id, fileName: currentSelection.file.name, result: completedResult }]);
            setAnalysis({ status: "completed", result: completedResult });
            break;
          }
          if (statusBody.status === "failed") {
            setAnalysisProgress(null);
            setAnalysis({
              status: "failed",
              message: typeof statusBody.error?.message === "string" ? statusBody.error.message : "Content analysis failed. No result was produced.",
              retryable: statusBody.error?.retryable === true,
            });
            return;
          }
          if (statusBody.status === "queued" || statusBody.status === "processing") {
            setAnalysis({ status: statusBody.status });
            continue;
          }
          setAnalysis({ status: "failed", message: "The analysis service returned an invalid status. No result was produced.", retryable: false });
          setAnalysisProgress(null);
          return;
        }
      } catch {
        setAnalysisProgress(null);
        if (currentAnalysis === analysisId.current) {
          setAnalysis({ status: "failed", message: "The connection was interrupted. Your selected file remains available, but no result was received.", retryable: false });
        }
        return;
      }
    }
    if (currentAnalysis === analysisId.current) {
      setAnalysisProgress(null);
    }
  };

  const visibleFileError = fileError;
  const errorMessage = visibleFileError === "unsupported"
    ? "That file type is not supported. Choose a JPEG, PNG, WebP, GIF preview, or MP4 video."
    : visibleFileError === "batch-limit"
      ? `Choose up to ${MEDIA_CHECK_MAX_IMAGE_BATCH} images at a time.`
      : visibleFileError === "mixed-media"
        ? "Choose multiple images together, or choose one video by itself."
    : visibleFileError === "type-mismatch"
      ? "The image contents do not match the selected file type. Choose a valid JPEG, PNG, WebP, or GIF image."
      : visibleFileError === "too-large"
        ? "That file exceeds the supported size limit (5 MB for images; 25 MB for videos). Choose a smaller file."
        : visibleFileError === "empty"
          ? "That media file is empty. Choose another file."
          : visibleFileError === "unreadable"
            ? "This media file could not be read. Choose it again or select another file."
            : visibleFileError === "preview"
              ? "The selected file could not be previewed. Choose another file."
              : visibleFileError === "invalid-media"
                ? "This media file is incomplete or invalid. Choose another file."
                : visibleFileError === "duration"
                  ? `Videos must be shorter than ${Math.floor((providerConfig?.limits.videoMaxSeconds ?? MEDIA_CHECK_MAX_VIDEO_SECONDS) / 60)} minutes.`
                  : visibleFileError === "dimensions"
                    ? "The media dimensions are larger than the supported limit."
                    : visibleFileError === "timeout"
                      ? "Video preview timed out while checking its metadata. Choose the file again or try a supported MP4."
                      : visibleFileError === "unsupported-codec"
                        ? "This MP4 could not be played in this browser, so its video details could not be checked and analysis was not started. Re-export it as a standard H.264 MP4 (with AAC audio if present), then choose it again."
                        : visibleFileError === "decode-failed"
                          ? "This MP4 could not be decoded, so analysis was not started. Re-export it as a standard H.264 MP4 (with AAC audio if present), then choose it again."
                        : null;

  const activeAnalysis = ["submitting", "queued", "processing"].includes(analysis.status);
  const providerReady = providerConfig?.contentUnderstanding.ready === true;
  const formatsText = providerConfig
    ? `Images: JPEG, PNG, WebP (up to ${providerConfig.limits.imageBytes / (1024 * 1024)} MB each; up to ${MEDIA_CHECK_MAX_IMAGE_BATCH} images). GIF preview only. Video: one MP4 (up to ${providerConfig.limits.videoBytes / (1024 * 1024)} MB, under ${Math.floor(providerConfig.limits.videoMaxSeconds / 60)} minutes, up to ${providerConfig.limits.videoMaxWidth}×${providerConfig.limits.videoMaxHeight} in either orientation).`
    : `Images: JPEG, PNG, WebP (up to ${MEDIA_CHECK_MAX_IMAGE_BYTES / (1024 * 1024)} MB each; up to ${MEDIA_CHECK_MAX_IMAGE_BATCH} images). GIF preview only. Video: one MP4 (up to ${MEDIA_CHECK_MAX_VIDEO_BYTES / (1024 * 1024)} MB, under ${Math.floor(MEDIA_CHECK_MAX_VIDEO_SECONDS / 60)} minutes).`;
  const fileAccept = [...previewTypes].join(",");

  return (
    <div className="smartbuild-entrance mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-1 pb-8 pt-5 sm:px-4 sm:pb-12">
      <div className="mb-7 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-200/[0.06] text-cyan-100">
          <ScanSearch className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">AI Image Check</span>
      </div>

      <h1 className="max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Can this image be trusted?</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Images and videos are analyzed with Google Gemini after you confirm upload. Results are estimates, not proof of authenticity.</p>

      <div
        className={`mt-8 rounded-2xl border bg-[#0d1521]/90 p-4 transition-colors sm:p-6 ${dragging ? "border-cyan-200/60 bg-cyan-200/[0.05]" : "border-white/10"}`}
        onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={event => {
          event.preventDefault();
          setDragging(false);
          const files = Array.from(event.dataTransfer.files);
          const candidates = files.filter(file => previewTypes.some(type => type === file.type));
          if (candidates.length) void selectFiles(candidates);
        }}
        aria-label="Media selection area"
      >
        <input
          ref={fileInputRef}
          id="ai-image-check-file"
          type="file"
          accept={fileAccept}
          multiple
          className="sr-only"
          aria-label="Choose up to five images or one MP4 video to check"
          aria-describedby="ai-image-check-file-types"
          onChange={event => chooseFile(event.currentTarget.files)}
        />
        <label htmlFor="ai-image-check-file" className="sr-only">Choose up to five images or one MP4 video to check</label>

        {!selection ? (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.14] px-4 py-7 text-center sm:min-h-60 sm:py-10">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-300">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-slate-100">Drop up to five images or one MP4 video here</p>
            <p className="mt-1.5 text-xs text-slate-500">or choose media from your device</p>
            <button
              type="button"
              aria-controls="ai-image-check-file"
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#7ed8ff] px-4 py-2 text-sm font-medium text-[#07131e] transition hover:bg-[#9fe6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1521]"
            >
              <FileImage className="h-4 w-4" aria-hidden="true" />
              Choose media
            </button>
            <p id="ai-image-check-file-types" className="mt-4 text-[11px] text-slate-500">{formatsText}</p>
            {validating && <p className="mt-3 text-xs text-slate-400" role="status" aria-live="polite">Checking the selected file…</p>}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)] sm:items-center">
            <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-black/25 p-2 sm:min-h-60">
              {selection.mediaType === "video" ? (
                <video
                  src={selection.previewUrl}
                  controls
                  preload="metadata"
                  muted
                  aria-label={`Preview of ${selection.file.name}`}
                  onError={event => {
                    const errorCode = event.currentTarget.error?.code;
                    const error = errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
                      ? "unsupported-codec"
                      : errorCode === MediaError.MEDIA_ERR_DECODE
                        ? "decode-failed"
                        : "unreadable";
                    failCurrentPreview(selection.previewUrl, error);
                  }}
                  className="max-h-72 max-w-full rounded-lg"
                />
              ) : (
                <img
                  src={selection.previewUrl}
                  alt={`Preview of ${selection.file.name}`}
                  onError={() => failCurrentPreview(selection.previewUrl, "preview")}
                  className="max-h-72 max-w-full rounded-lg object-contain"
                />
              )}
            </div>
            <div className="min-w-0">
              {selectedBatch.length > 1 && (
                <p className="mb-2 text-xs font-medium text-cyan-100">{selectedBatch.length} images selected · analyzed one at a time</p>
              )}
              {selection.file.type !== "image/gif" && (
                <p className="mb-2 text-xs leading-5 text-slate-500">
                  Each image or video gets 2–4 separate Gemini reviews. The media is uploaded once and reviewed in separate requests; these reviews are not independent detectors.
                </p>
              )}
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-slate-300">
                  {selection.mediaType === "video" ? <Video className="h-4 w-4" aria-hidden="true" /> : <FileImage className="h-4 w-4" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium text-slate-100">{selection.file.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatAiImageCheckFileSize(selection.file.size)}
                    {selection.durationSeconds !== undefined && ` · ${Math.ceil(selection.durationSeconds)} sec`}
                  </p>
                  {selection.file.type === "image/gif" && <p className="mt-1 text-xs text-slate-500">GIF preview only; animation is not analyzed.</p>}
                  {selection.mediaType === "video" && <p className="mt-1 text-xs text-slate-500">The MP4 is uploaded to Gemini for analysis. Videos over 10 minutes are not supported.</p>}
                </div>
                <button
                  type="button"
                  aria-label="Remove media"
                  onClick={removeSelection}
                  disabled={activeAnalysis}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {selection.file.type === "image/gif" ? (
                <div className="mt-5 rounded-xl border border-amber-200/20 bg-amber-200/[0.045] p-3.5" role="status">
                  <p className="text-xs font-medium text-amber-100">GIF is preview-only</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Choose a JPEG, PNG, or WebP image to start content understanding. No analysis ran for this GIF.</p>
                </div>
              ) : providerReady ? (
                null
              ) : (
                <div id="ai-image-check-unavailable" className="mt-5 rounded-xl border border-amber-200/20 bg-amber-200/[0.045] p-3.5" role="status" aria-live="polite">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
                    <div>
                      <p className="text-xs font-medium text-amber-100">Content analysis is unavailable</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {providerUnavailable ? "The analysis service could not be reached. No file was sent and no result is available." : "No configured content-analysis provider is ready. No file will be sent and no result is available."}
                      </p>
                      {providerUnavailable && (
                        <button
                          type="button"
                          onClick={() => void retryProviderConnection()}
                          disabled={retryingProvider}
                          className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md text-xs font-medium text-cyan-100 underline underline-offset-2 disabled:opacity-60"
                        >
                          {retryingProvider && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                          {retryingProvider ? "Checking service…" : "Retry service connection"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {selection.file.type !== "image/gif" && (
                <div className="mt-5 space-y-3">
                  <label className="block" htmlFor="ai-image-check-question">
                    <textarea
                      id="ai-image-check-question"
                      aria-label="Optional question about this image or video"
                      value={question}
                      onChange={event => setQuestion(event.target.value.slice(0, 500))}
                      maxLength={500}
                      rows={3}
                      disabled={activeAnalysis}
                      dir="auto"
                      placeholder="Type your question here… / اكتب سؤالك هنا…"
                      className="min-h-32 w-full resize-y rounded-xl border border-white/10 bg-[#0b121c] px-4 py-4 text-base leading-7 text-slate-100 outline-none placeholder:text-slate-400 focus:border-cyan-200/40 focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:opacity-60"
                    />
                    <span className="mt-1 block text-right text-[10px] font-normal text-slate-500">{question.length}/500</span>
                  </label>
                </div>
              )}

              {selection.file.type !== "image/gif" && (
                <button
                  type="button"
                  disabled={!providerReady || activeAnalysis || validating || analysis.status === "completed" || (analysis.status === "failed" && !analysis.retryable)}
                  aria-describedby={!providerReady ? "ai-image-check-unavailable" : undefined}
                  onClick={confirmAnalysis}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#7ed8ff] px-4 py-2 text-sm font-medium text-[#07131e] transition hover:bg-[#9fe6ff] disabled:cursor-not-allowed disabled:bg-[#7ed8ff]/40 disabled:text-[#07131e]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1521]"
                >
                  {activeAnalysis ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ScanSearch className="h-4 w-4" aria-hidden="true" />}
                  {analysis.status === "submitting" ? "Sending media…" : analysis.status === "queued" ? "Queued…" : analysis.status === "processing" ? "Analyzing content…" : selection.mediaType === "video" ? "Analyze video" : selectedBatch.length > 1 ? `Analyze ${selectedBatch.length} images` : "Analyze image"}
                </button>
              )}
              {analysisProgress && (
                <p className="mt-2 text-center text-xs text-slate-400" role="status" aria-live="polite">
                  Analyzing image {analysisProgress.current} of {analysisProgress.total}…
                </p>
              )}
              {activeAnalysis && (
                <p className="mt-2 text-center text-xs text-slate-500" role="status">
                  The media is reviewed in 2–4 separate Gemini requests; longer videos may take more time. Clips over 10 minutes are not supported.
                </p>
              )}
              {analysisConfirmationPending && (
                <div className="mt-3 rounded-lg border border-cyan-200/15 bg-cyan-200/[0.035] p-3" role="group" aria-label="Confirm media analysis">
                  <p className="text-xs leading-5 text-slate-300">
                    To analyze {selectedBatch.length > 1 ? `these ${selectedBatch.length} images` : "this file"}, {selectedBatch.length > 1 ? "they will be" : "it will be"} uploaded to the Google Gemini API for 2–4 separate reviews. Google may process the media under its Gemini API terms; the uploaded file is deleted after analysis when supported, otherwise Google's file-retention policy applies. Continue?
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAnalysisConfirmationPending(false)}
                      className="min-h-9 rounded-lg border border-white/15 px-3 text-xs font-medium text-slate-300 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={proceedWithAnalysis}
                      className="min-h-9 rounded-lg bg-[#7ed8ff] px-3 text-xs font-medium text-[#07131e] hover:bg-[#9fe6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}
              {selectedBatch.length > 1 && (
                <ul className="mt-3 space-y-1 text-xs text-slate-400" aria-label="Selected images">
                  {selectedBatch.map((item, index) => (
                    <li key={item.id} className="truncate">{index + 1}. {item.file.name}</li>
                  ))}
                </ul>
              )}
              {selection.file.type !== "image/gif" && selection.mediaType === "image" && selectedBatch.length < MEDIA_CHECK_MAX_IMAGE_BATCH && analysis.status === "idle" && (
                <button
                  type="button"
                  aria-controls="ai-image-check-file"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-medium text-slate-200 transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                >
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add more images
                </button>
              )}
              <button
                type="button"
                onClick={removeSelection}
                disabled={activeAnalysis}
                className="mt-3 ml-2 inline-flex min-h-9 items-center rounded-lg border border-white/10 px-3 text-xs font-medium text-slate-300 transition hover:bg-white/[0.05] disabled:opacity-50"
              >
                Clear selection
              </button>
              {validating && <p className="mt-2 text-xs text-slate-400" role="status" aria-live="polite">Checking the replacement file…</p>}
            </div>
          </div>
        )}

        {errorMessage && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200/15 bg-rose-200/[0.04] px-3 py-2.5 text-xs leading-5 text-rose-100" role="alert">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {errorMessage}
          </p>
        )}

        {analysis.status === "failed" && (
          <div className="mt-3 rounded-lg border border-rose-200/15 bg-rose-200/[0.04] px-3 py-2.5 text-xs leading-5 text-rose-100" role="alert">
            <p>{analysis.message}</p>
            {analysis.retryable && <button type="button" onClick={confirmAnalysis} className="mt-2 min-h-8 rounded-md underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">Try again (sends the file again)</button>}
          </div>
        )}

        {batchResults.length > 0 && (
          <div className="mt-5 space-y-3" aria-live="polite">
            {batchResults.map(({ selectionId, fileName, result }) => {
              const estimate = result.contentUnderstanding.aiGenerationEstimate;
              const reviewScores = result.contentUnderstanding.reviewPasses.map(pass => pass.aiGeneratedLikelihoodPercent);
              const reviewRange = `${Math.min(...reviewScores)}–${Math.max(...reviewScores)}%`;
              const scoreSpread = Math.max(...reviewScores) - Math.min(...reviewScores);
              const inconclusive = estimate.aiGeneratedLikelihoodPercent === 50
                || scoreSpread > 12;
              return (
                <section key={selectionId} className="space-y-3 rounded-xl border border-cyan-200/15 bg-cyan-200/[0.035] p-4">
                  <h2 className="truncate text-sm font-medium text-white" title={fileName}>{fileName}</h2>
                  {estimate.aiGeneratedLikelihoodPercent === 50 || scoreSpread > 12 ? (
                    <p className="rounded-lg border border-amber-200/20 bg-amber-200/[0.05] p-3 text-xs leading-5 text-amber-100" role="status">
                      {estimate.aiGeneratedLikelihoodPercent === 50
                        ? "Inconclusive — Gemini found no clear visual evidence to choose either direction. 50/100 is a neutral score, not a finding that the media is half AI-generated."
                        : `Inconclusive — Gemini review scores disagree (range ${reviewRange}), so the overall score is not a reliable verdict.`}
                    </p>
                  ) : null}
                  <div className="rounded-lg border border-cyan-200/15 bg-black/15 p-3">
                    <p className="text-xs leading-5 text-slate-400">
                      {inconclusive ? "Neutral visual score (not a probability)" : "AI-generated visual estimate (not calibrated)"}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-cyan-100">
                      {inconclusive ? `${estimate.aiGeneratedLikelihoodPercent}/100 · Inconclusive` : `${estimate.aiGeneratedLikelihoodPercent}%`}
                    </p>
                    {!inconclusive && (
                      <p className="mt-1 text-xs text-slate-400">Likely real / not AI-generated: {100 - estimate.aiGeneratedLikelihoodPercent}% (complementary estimate only)</p>
                    )}
                  </div>
                  {!inconclusive && <p className="text-sm leading-6 text-slate-300">{estimate.explanation}</p>}
                  <details className="rounded-lg border border-white/10 bg-black/15 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-300">
                      Review details ({result.contentUnderstanding.reviewPasses.length})
                    </summary>
                    <ul className="mt-3 space-y-2">
                      {result.contentUnderstanding.reviewPasses.map((pass, index) => (
                        <li key={`${index}-${pass.method}`} className="text-xs leading-5 text-slate-400">
                          <span className="font-medium text-slate-200">{pass.method}:</span>{" "}
                          {pass.aiGeneratedLikelihoodPercent}/100 score · {pass.selfAssessedConfidencePercent}/100 subjective clarity
                          <span className="block">{pass.explanation}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] leading-4 text-slate-500">
                      Each review is a separate model request, but repeated requests to one model are not independent detectors. Clarity scores are subjective, not calibrated.
                    </p>
                  </details>
                  <details className="rounded-lg border border-white/10 bg-black/15 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-300">Content observations</summary>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{result.contentUnderstanding.summary}</p>
                    {result.contentUnderstanding.observations.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-400">
                        {result.contentUnderstanding.observations.slice(0, 4).map((observation, index) => <li key={`${index}-${observation}`}>{observation}</li>)}
                      </ul>
                    )}
                    {result.contentUnderstanding.timestampFindings.length > 0 && (
                      <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-400">
                        {result.contentUnderstanding.timestampFindings.map((finding, index) => (
                          <li key={`${index}-${finding.timestamp}`}><span className="font-mono text-cyan-200">{finding.timestamp}</span> · {finding.description}</li>
                        ))}
                      </ul>
                    )}
                  </details>
                  <button
                    type="button"
                    onClick={() => onAskAboutImage(
                      `Please answer briefly in ${result.contentUnderstanding.responseLanguage}. Explain the visual estimate and observed cues in plain language. Estimate: ${estimate.aiGeneratedLikelihoodPercent}/100; treat 50 or conflicting reviews as inconclusive, not as proof. Observations: ${result.contentUnderstanding.summary} ${result.contentUnderstanding.observations.slice(0, 4).join("; ")} Question: ${question.trim() || "Explain the result simply."}`,
                    )}
                    className="inline-flex min-h-9 items-center rounded-lg border border-cyan-200/20 px-3 text-xs font-medium text-cyan-100 hover:bg-cyan-200/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                  >
                    Ask in chat
                  </button>
                </section>
              );
            })}
            <button type="button" onClick={removeSelection} className="inline-flex min-h-9 items-center rounded-lg border border-white/10 px-3 text-xs font-medium text-slate-200 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
              Check another image or video
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2.5 px-1 text-xs leading-5 text-slate-500">
        <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        <p>{selection && providerReady && selection.file.type !== "image/gif" ? "The selected file stays in the local preview until you confirm analysis. Confirming uploads it to the Google Gemini API." : "Selected media is previewed locally. It is not sent anywhere until you explicitly start an available analysis."}</p>
      </div>

      <span className="sr-only">Supported previews: JPEG, PNG, WebP, GIF, and MP4. GIF is preview-only. Image analysis supports JPEG, PNG, and WebP up to {MEDIA_CHECK_MAX_IMAGE_BYTES / (1024 * 1024)} megabytes, with a maximum edge of {MEDIA_CHECK_MAX_IMAGE_EDGE} pixels and {MEDIA_CHECK_MAX_IMAGE_PIXELS} pixels total. Video analysis supports MP4 up to {MEDIA_CHECK_MAX_VIDEO_BYTES / (1024 * 1024)} megabytes, under {Math.floor(MEDIA_CHECK_MAX_VIDEO_SECONDS / 60)} minutes, and up to {MEDIA_CHECK_MAX_VIDEO_WIDTH} by {MEDIA_CHECK_MAX_VIDEO_HEIGHT} pixels in either orientation.</span>
    </div>
  );
}
