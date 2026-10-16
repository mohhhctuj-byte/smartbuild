import "./loadEnv";
import crypto from "crypto";
import express, { type Request, type Response } from "express";
import { createServer } from "http";
import net from "net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { workspaceAssistantInstructions, workspaceCapabilityInstructions } from "../aiResponsePolicy";
import { addGeneratedFile, addMessage, addResearchSources, appendProjectEvent, archiveProjectForUser, claimDurableBuildRunAdvancement, claimLegacyGeneratedFilesForBuildRun, claimLegacyWorkspaceForAccount, createConversation, createDurableBuildRun, createProject, createProjectSecret, createUpload, deleteGeneratedFileForBuildRun, deleteLocalFolderBinding, deleteProjectForUser, deleteProjectSecret, getBuildRunReviewForUser, getCanonicalReleaseGateOwner, getConversationForUser, getConversationMessages, getDurableBuildRunById, getDurableBuildRunForHeartbeatTask, getDurableBuildRunForUser, getFirstPartySessionAccount, getLegacyWorkspaceClaimState, getLocalFolderBinding, getProjectForUser, getSiteAnalyticsDashboard, getWorkspaceSelection, listConversations, listDurableBuildRuns, listGeneratedFiles, listGeneratedFilesForBuildRun, listProjects, listProjectEvents, listProjectSecrets, listResearchSources, listUploads, recordSiteAnalyticsActivity, releaseDurableBuildRunAdvancement, renewDurableBuildRunAdvancement, restoreArchivedProjectForUser, saveBuildRunReviewForUser, saveLocalFolderBinding, saveWorkspaceSelection, updateConversationTitle, updateConversationTitleIfUntitled, updateDurableBuildRun, updateDurableBuildRunHeartbeatTask, updateDurableBuildRunWithAdvancementLease, updateGeneratedFile, updateProjectBuildStatus, updateProjectDetails, updateProjectNameIfUntitled, updateProjectSecret, upsertUser } from "../db";
import { canAutoTitleConversation, cleanGeneratedConversationTitle, cleanTitle, isUntitledProjectName, normaliseResearchQuery, preserveMarkdownHistory } from "../workspace";
import { researchWeb } from "../webResearch";
import { appRouter } from "../routers";
import { storagePut } from "../storage";
import { MAX_REFERENCE_UPLOAD_BYTES, referenceUploadFailureMessage, referenceUploadScope, saveReferenceFile } from "../referenceUploads";
import { attachImagesToLatestUserMessage, loadVisionAttachments, loadVisionImages } from "../visionAttachments";
import { encodeMessageAttachments } from "@shared/chatAttachments";
import { createContext, readCookie } from "./context";
import { sdk } from "./sdk";
import { createHeartbeatJob, deleteHeartbeatJob } from "./heartbeat";
import { getDb } from "../db";
import { chooseWorkspaceBuildRun, matchesWorkspaceBuildRunTuple, matchesWorkspaceProjectIdentity, type DurableBuildRunCandidate } from "../workspaceSelection";
import { ENV } from "./env";
import { manusHeartbeatSessionFromCookie } from "../manusHeartbeatSession";
import { analyzeGeminiMedia, generateWorkspaceConversationTitle, getAiProviderFailureMessage, invokeWorkspaceLLMStream, isAnthropicProviderConfigured, shouldFallbackToBrowser, verifyGeminiProvider, verifyOllamaProvider } from "../llmStream";
import { registerMediaCheckRoutes } from "../mediaCheck";
import { isMediaProvenanceVerifierReady, verifyMediaProvenance } from "../mediaProvenance";
import { AI_MODEL_IDS } from "@shared/aiModels";
import { LOCAL_WORKSPACE_SCOPE, savePlan, getPlan, markCheckpoint, markPreview, markPreviewBlocked, markTested, recordEvent, appendProjectMemory, listProjectMemory } from "../taskGraphStore";
import { registerOAuthRoutes } from "./oauth";
import { configureTrustedProxy } from "./proxyConfig";
import { getProviderStatus } from "../providerStatus";
import { pythonRuntimeStatus } from "../pythonAgentBridge";
import { registerAgentRuntimeRoute } from "../agentRuntimeRoute";
import { registerLocalRoutes } from "../localRoutes";
import { cloudWorkspaceStatus, deleteCloudWorkspaceFile, exportCloudWorkspaceZip, listCloudWorkspaceFiles, readCloudWorkspaceFile, toCloudWorkspaceError, uploadCloudWorkspaceFile, writeCloudWorkspaceFile } from "../cloudWorkspace";
import { persistGeneratedCloudFiles } from "../generatedCloudFiles";
import { CloudRollbackError, rollbackCloudWorkspace } from "../cloudRollback";
import { CloudDiffError, readCloudRevisionDiff } from "../cloudDiff";
import { createProjectReportCsv, createProjectReportPdf, safeReportFileName, type ProjectReportSnapshot } from "../projectReport";
import { createSmartBuildDiscoverySnapshot } from "../projectDiscovery";
import { collapseLogicalWorkspaceProjects } from "../workspaceProjectList";
import { prepareAccountWorkspace } from "../workspaceProvisioning";
import { canonicalOwnerFallbackSelection } from "../canonicalOwnerWorkspace";
import { driveBuildRunHeartbeat, isTerminalBuildStatus } from "../buildRunHeartbeat";
import { durableProductionAgentQueueHooks } from "../productionAgentBuildLifecycle";
import { listLocalProductionAgentArtifacts, localProductionAgentQueueHooks, removeLocalProductionAgentArtifact } from "../localProductionAgentQueue";
import { BuildRunAdvancementLeaseLostError, buildWorkspacePath, cancelTimedOutBuild, continueVerifiedBuild, createProjectFromRequest, deleteBuildRunWorkspaceFile, detectWorkspaceCapabilities, ensureBuildPreview, exportBuildWorkspaceZip, forgetBuildRun, getBuildRun, inspectBuildRunDatabase, listBuildWorkspaceFiles, readBuildPreview, readBuildWorkspaceFile, recordBuildRunStartupFailure, restoreBuildRun, restoreBuildWorkspace, saveBuildRunWorkspaceFile, type ArtifactLanguage, type BuildRun } from "../verifiedBuildPipeline";
import { registerStorageProxy } from "./storageProxy";
import { setupVite, serveStatic } from "./vite";
import { createWorkspaceDiagnostic, selectionForDiagnosticRun } from "../workspaceDiagnostics";
import { evaluateTruthEngine } from "../truthEngine";
import { createAgentsEvidenceHandler } from "../agentsEvidenceRoute";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { authoritativeBuildRunSnapshot, snapshotAfterRejectedLease } from "../buildRunAdvancementLease";
import { claimLocalBuildRunAdvancement, releaseLocalBuildRunAdvancement } from "../localBuildRunAdvancementLease";
import { authCookieOptions, createDemoSession, createGuestSession, DEMO_SESSION_COOKIE, FIRST_PARTY_SESSION_COOKIE, FirstPartyAuthError, GUEST_SESSION_COOKIE, hashSessionToken, loginWithEmail, logoutFirstPartySession, readDemoSession, requestPasswordReset, REMEMBERED_SESSION_COOKIE, resendVerificationOtp, resetPasswordWithOtp, signUpWithEmail, verifyEmailOtp } from "../firstPartyAuth";
import { sendResendDiagnosticEmail, verifyEmailProvider, type EmailProviderStatus, type ResendDiagnosticCode } from "../emailProvider";
import { deletionAssistantSummary, executeWorkspaceDeletion, isWorkspaceDeletionRequest } from "../workspaceDeletion";
import { generateWorkspaceName } from "../workspaceName";
import { apiSecretRequirementForBuild } from "../apiSecretRequirements";
import { aggregatePublishedAnalytics, hashAnalyticsId, injectPublishedAnalytics, parseAnalyticsDateRange, parsePublishedAnalyticsEvent } from "../publishedSiteAnalytics";
import { encryptProjectSecret, validProjectSecretInput } from "../projectSecrets";
import { containsLikelyApiSecret, historyContainsLikelyApiSecret } from "../../shared/apiSecretGuard";

type PreparedWorkspaceResponse = Awaited<ReturnType<typeof prepareAccountWorkspace>> & { run: BuildRun | null };

const execFileAsync = promisify(execFile);
const activeBuildSteps = new Map<string, Promise<BuildRun>>();
const publicAnalyticsRateLimits = new Map<string, { windowStart: number; count: number }>();
const publicContactRateLimits = new Map<string, { windowStart: number; count: number }>();
const guestSessionRateLimits = new Map<string, { windowStart: number; count: number }>();
const LEGACY_GMAIL_NOTIFICATION_SECRET_NAME = "SMARTBUILD_GMAIL_NOTIFICATIONS";
const BUILD_RUN_ADVANCEMENT_LEASE_MS = 30 * 60 * 1000;
const BUILD_RUN_ADVANCEMENT_RENEW_INTERVAL_MS = 30 * 1000;
const activeWorkspaceProvisioning = new Map<number, Promise<PreparedWorkspaceResponse>>();
const localBuildRunStateRoot = path.join(process.cwd(), ".smartbuild-local-state", "build-runs");
const SITE_ANALYTICS_OWNER_EMAIL = "moamedsaah0@gmail.com";
const SITE_ANALYTICS_VISITOR_COOKIE = "smartbuild_analytics_visitor";
const siteAnalyticsRateLimits = new Map<string, { windowStartedAt: number; count: number }>();

function siteAnalyticsHash(value: string) {
  return crypto.createHmac("sha256", ENV.cookieSecret || "smartbuild-analytics-development-secret").update(value).digest("hex");
}

function permitGuestSessionCreation(ip: string) {
  const now = Date.now();
  const key = siteAnalyticsHash(`guest:${ip}`);
  const current = guestSessionRateLimits.get(key);
  if (!current || now - current.windowStart >= 10 * 60_000) {
    guestSessionRateLimits.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

function siteAnalyticsCookieOptions(req: Request) {
  return { httpOnly: true, sameSite: "lax" as const, secure: req.secure, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 };
}

async function verifiedAnalyticsAccount(req: Request) {
  if (readDemoSession(readCookie(req.headers.cookie, DEMO_SESSION_COOKIE))) return null;
  const token = readCookie(req.headers.cookie, FIRST_PARTY_SESSION_COOKIE)
    || readCookie(req.headers.cookie, REMEMBERED_SESSION_COOKIE);
  if (!token) return null;
  const account = await getFirstPartySessionAccount(hashSessionToken(token));
  return account?.emailVerified ? account : null;
}

function permitSiteAnalyticsWrite(key: string) {
  const now = Date.now();
  const existing = siteAnalyticsRateLimits.get(key);
  if (!existing || now - existing.windowStartedAt >= 60_000) {
    siteAnalyticsRateLimits.set(key, { windowStartedAt: now, count: 1 });
    return true;
  }
  if (existing.count >= 20) return false;
  existing.count += 1;
  if (siteAnalyticsRateLimits.size > 10_000) {
    for (const [entryKey, limit] of Array.from(siteAnalyticsRateLimits.entries())) {
      if (now - limit.windowStartedAt >= 60_000) siteAnalyticsRateLimits.delete(entryKey);
    }
  }
  return true;
}

function publicationToken(buildRunId: string) {
  const secret = ENV.cookieSecret || "smartbuild-publication-development-secret";
  const encodedId = Buffer.from(buildRunId, "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(buildRunId).digest("base64url");
  return `${encodedId}.${signature}`;
}

function buildRunIdFromPublicationToken(token: string) {
  const [encodedId, signature] = token.split(".");
  if (!encodedId || !signature) return null;
  let buildRunId = "";
  try { buildRunId = Buffer.from(encodedId, "base64url").toString("utf8"); } catch { return null; }
  const expected = publicationToken(buildRunId).split(".")[1];
  const received = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (received.length !== expectedBytes.length || !crypto.timingSafeEqual(received, expectedBytes)) return null;
  return buildRunId;
}

function localBuildRunStatePath(userId: number, buildRunId: string) {
  return path.join(localBuildRunStateRoot, String(userId), `${buildRunId}.json`);
}

async function listLocalBuildRunCandidates(userId: number, projectId: number): Promise<DurableBuildRunCandidate[]> {
  if (await getDb()) return [];
  try {
    const entries = await readdir(path.join(localBuildRunStateRoot, String(userId)));
    const candidates = await Promise.all(entries.filter(entry => entry.endsWith(".json")).map(async (entry: string): Promise<DurableBuildRunCandidate | null> => {
      try {
        const run = JSON.parse(await readFile(path.join(localBuildRunStateRoot, String(userId), entry), "utf8")) as BuildRun;
        if (run.userId !== userId || run.projectId !== projectId) return null;
        return {
          id: run.id,
          projectId: run.projectId,
          conversationId: run.conversationId,
          status: run.status,
          updatedAt: run.evaluatorProgress?.updatedAt || run.completedAt || run.startedAt,
          sourceArtifactCount: (run.artifacts || []).filter(artifact =>
            typeof artifact.path === "string"
            && !artifact.path.startsWith("evidence/")
            && !artifact.path.startsWith("agent-artifacts/"),
          ).length,
          previewReady: run.preview?.status === "ready",
        };
      } catch {
        return null;
      }
    }));
    return candidates.filter((candidate): candidate is DurableBuildRunCandidate => Boolean(candidate));
  } catch {
    return [];
  }
}

function publicEvidencePath(value: unknown) {
  return typeof value === "string" && value.startsWith("evidence/") && !value.includes("..") && !value.includes("\\") ? value : "evidence/redacted-invalid-reference";
}

function publicText(value: unknown) {
  return String(value || "").replace(/(?:authorization|token|api[_-]?key|password|cookie)\s*[:=]\s*\S+/gi, "$1=[REDACTED]").slice(0, 1_200);
}

function publicResendDiagnosticCode(code: ResendDiagnosticCode) {
  const codes: Record<ResendDiagnosticCode, "ready" | "missing_secret" | "secret_not_reloaded" | "invalid_key" | "unverified_sender" | "resend_dev_restriction" | "quota_limit" | "invalid_smtp_credentials" | "smtp_configuration_invalid" | "network_error"> = {
    READY: "ready",
    MISSING_CONFIGURATION: "missing_secret",
    DEPLOYMENT_SECRET_NOT_RELOADED: "secret_not_reloaded",
    INVALID_API_KEY: "invalid_key",
    UNVERIFIED_SENDER_DOMAIN: "unverified_sender",
    RESEND_DEV_RECIPIENT_RESTRICTED: "resend_dev_restriction",
    QUOTA_OR_RATE_LIMIT: "quota_limit",
    SMTP_AUTH_FAILED: "invalid_smtp_credentials",
    SMTP_CONFIGURATION_INVALID: "smtp_configuration_invalid",
    NETWORK_OR_PROVIDER_ERROR: "network_error",
    PROVIDER_RESPONSE_INVALID: "network_error",
  };
  return codes[code];
}

function publicEmailAvailability(status: EmailProviderStatus) {
  const base = { state: status.state, diagnosticCode: publicResendDiagnosticCode(status.diagnosticCode) };
  if (status.state === "ready") return base;
  return {
    ...base,
    message: status.message === "Verification email service is not configured"
      ? "Verification email service is not configured"
      : "Email verification is temporarily unavailable.",
    ...(status.missingSecrets.length ? { missingSecrets: status.missingSecrets } : {}),
  };
}

function manusSessionToken(req: Request) {
  return manusHeartbeatSessionFromCookie(req.headers.cookie);
}

function publicSyntheticEvaluation(evaluation: BuildRun["syntheticEvaluation"]) {
  if (!evaluation) return undefined;
  return {
    ...evaluation,
    output_path: publicEvidencePath(evaluation.output_path),
    runs: evaluation.runs.map(run => ({ ...run, current_route: publicText(run.current_route) || undefined, current_step: publicText(run.current_step) || undefined, actions: run.actions.map(action => ({ route: publicText(action.route) || undefined, step: publicText(action.step) || undefined, passed: action.passed })), evidence_paths: run.evidence_paths.map(publicEvidencePath), screenshot_paths: run.screenshot_paths.map(publicEvidencePath), trace_path: run.trace_path ? publicEvidencePath(run.trace_path) : undefined, console_errors: run.console_errors.map(publicText), network_failures: run.network_failures.map(publicText), skip_reason: publicText(run.skip_reason) || undefined })),
    bugs: evaluation.bugs.map(bug => ({ ...bug, route: publicText(bug.route) || undefined, title: publicText(bug.title), expected_result: publicText(bug.expected_result), actual_result: publicText(bug.actual_result), selector_or_target: publicText(bug.selector_or_target) || undefined, steps_to_reproduce: bug.steps_to_reproduce.map(publicText), evidence_paths: bug.evidence_paths.map(publicEvidencePath), screenshot_paths: bug.screenshot_paths.map(publicEvidencePath), trace_path: bug.trace_path ? publicEvidencePath(bug.trace_path) : undefined, console_errors: bug.console_errors.map(publicText), network_failures: bug.network_failures.map(publicText) })),
    repair_tasks: evaluation.repair_tasks.map(task => ({ ...task, resource_locks: task.resource_locks.map(publicText), reason: publicText(task.reason) })),
  };
}

function publicBuildRun(run: BuildRun) {
  const { workspaceRoot: _workspaceRoot, heartbeatTaskUid: _heartbeatTaskUid, preview, backend, syntheticEvaluation, ...safe } = run;
  return {
    ...safe,
    preview: preview ? { proxyUrl: preview.proxyUrl, checkedAt: preview.checkedAt, assets: preview.assets } : undefined,
    backend: backend ? { kind: backend.kind, database: backend.database, startedAt: backend.startedAt } : undefined,
    syntheticEvaluation: publicSyntheticEvaluation(syntheticEvaluation),
  };
}

function numeric(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

async function recordVerifiedBuildMemory(run: BuildRun) {
  if (run.status !== "succeeded") return;
  const entries = await listProjectMemory(run.userId, run.projectId, run.conversationId);
  if (entries.some(entry => entry.kind === "build_summary" && entry.payload.buildRunId === run.id)) return;
  for (const artifact of run.artifacts) {
    if (artifact.path.startsWith("evidence/")) continue;
    await appendProjectMemory(run.userId, run.projectId, run.conversationId, "file_proposal", {
      buildRunId: run.id,
      path: artifact.path,
      summary: `Verified Build artifact (${artifact.size} bytes).`,
    });
  }
  await appendProjectMemory(run.userId, run.projectId, run.conversationId, "build_summary", {
    buildRunId: run.id,
    status: run.status,
    summary: `${run.artifacts.length} project artifact(s) passed verification.`,
  });
}

function durableRunInput(run: BuildRun) {
  return {
    id: run.id,
    userId: run.userId,
    projectId: run.projectId,
    conversationId: run.conversationId,
    heartbeatTaskUid: run.heartbeatTaskUid ?? null,
    status: run.status,
    workspaceRoot: run.workspaceRoot,
    payload: JSON.stringify(run),
    startedAt: new Date(run.startedAt),
    completedAt: run.completedAt ? new Date(run.completedAt) : null,
  };
}

async function saveBuildRunSnapshot(run: BuildRun) {
  if (!(await getDb())) {
    await mkdir(path.dirname(localBuildRunStatePath(run.userId, run.id)), { recursive: true });
    await writeFile(localBuildRunStatePath(run.userId, run.id), JSON.stringify(run), "utf8");
    return;
  }
  const input = durableRunInput(run);
  const existing = await getDurableBuildRunForUser(run.userId, run.id);
  if (existing) await updateDurableBuildRun(input);
  else await createDurableBuildRun(input);
}

function leaseScopedBuildPersistence(persistence: ReturnType<typeof buildPersistence>, leaseToken: string) {
  return {
    ...persistence,
    saveBuildRun: async (run: BuildRun) => {
      const saved = await updateDurableBuildRunWithAdvancementLease(durableRunInput(run), leaseToken);
      if (!saved) throw new BuildRunAdvancementLeaseLostError();
    },
  };
}

async function loadDurableBuildRun(userId: number, buildId: string, options?: { forceDurable?: boolean }) {
  const run = options?.forceDurable ? undefined : getBuildRun(buildId);
  if (run?.userId === userId) return run;
  const record = await getDurableBuildRunForUser(userId, buildId);
  if (!record) {
    if (process.env.DATABASE_URL?.trim()) return null;
    try {
      const local = JSON.parse(await readFile(localBuildRunStatePath(userId, buildId), "utf8")) as BuildRun;
      if (local.id !== buildId || local.userId !== userId) return null;
      return restoreBuildRun(local);
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(record.payload) as BuildRun;
    if (parsed.id !== record.id || parsed.userId !== userId || parsed.projectId !== record.projectId || parsed.workspaceRoot !== record.workspaceRoot) return null;
    const restored = restoreBuildRun({ ...parsed, heartbeatTaskUid: record.heartbeatTaskUid ?? undefined, status: record.status, startedAt: record.startedAt.toISOString(), completedAt: record.completedAt?.toISOString() });
    if (restored.error?.code === "BUILD_EXECUTION_MODE_REQUIRED" && record.status !== "blocked") {
      await saveBuildRunSnapshot(restored);
      await updateProjectBuildStatus(restored.userId, restored.projectId, restored.status);
    }
    return restored;
  } catch {
    return null;
  }
}

async function loadPublishedBuildRun(buildId: string) {
  const live = getBuildRun(buildId);
  if (live) return live;

  const durable = await getDurableBuildRunById(buildId);
  if (durable) return loadDurableBuildRun(durable.userId, buildId);
  if (await getDb()) return null;

  let owners: import("node:fs").Dirent[];
  try {
    owners = await readdir(localBuildRunStateRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  for (const owner of owners) {
    if (!owner.isDirectory() || !/^\d+$/.test(owner.name)) continue;
    const run = await loadDurableBuildRun(Number(owner.name), buildId);
    if (run) return run;
  }
  return null;
}

async function restoreWorkspaceSelection(userId: number) {
  const persisted = await getWorkspaceSelection(userId);
  const canonicalOwner = await getCanonicalReleaseGateOwner();
  const canonicalFallback = canonicalOwnerFallbackSelection({
    sessionWorkspaceUserId: userId,
    canonicalWorkspaceUserId: canonicalOwner?.id,
    stored: persisted ? { projectId: persisted.projectId, conversationId: persisted.conversationId, buildRunId: persisted.buildRunId } : null,
  });
  const stored = canonicalFallback ? await saveWorkspaceSelection(userId, canonicalFallback) : persisted;
  let run = stored?.buildRunId ? await loadDurableBuildRun(userId, stored.buildRunId) : null;
  if (run) {
    const project = await getProjectForUser(userId, run.projectId);
    if (!project || !matchesWorkspaceProjectIdentity(project.name, run.contract.projectName)) {
      // Do not fall back to this project's latest run: a persisted named
      // identity conflict is evidence of historical cross-run contamination,
      // not an invitation to select another unrelated artifact set.
      const selection = await saveWorkspaceSelection(userId, {
        projectId: stored?.projectId ?? run.projectId,
        conversationId: stored?.conversationId ?? run.conversationId,
        buildRunId: null,
      });
      return {
        selection: selection ? { projectId: selection.projectId, conversationId: selection.conversationId, buildRunId: selection.buildRunId } : null,
        run: null,
      };
    }
  }
  const selectedProjectRecords = stored?.projectId
    ? [
        ...(await listDurableBuildRuns(userId, stored.projectId)).map(record => {
          let sourceArtifactCount = 0;
          let previewReady = false;
          try {
            const payload = JSON.parse(record.payload) as {
              artifacts?: Array<{ path?: unknown }>;
              preview?: { status?: unknown };
            };
            sourceArtifactCount = (payload.artifacts || []).filter(artifact =>
              typeof artifact.path === "string"
              && !artifact.path.startsWith("evidence/")
              && !artifact.path.startsWith("agent-artifacts/"),
            ).length;
            previewReady = payload.preview?.status === "ready";
          } catch {
            sourceArtifactCount = 0;
          }
          return { ...record, sourceArtifactCount, previewReady };
        }),
        ...(await listLocalBuildRunCandidates(userId, stored.projectId)),
      ]
    : [];
  const allRecords = stored ? [] : (await Promise.all((await listProjects(userId)).map(project => listDurableBuildRuns(userId, project.id)))).flat();
  const latest = chooseWorkspaceBuildRun(
    stored ? { projectId: stored.projectId, conversationId: stored.conversationId, buildRunId: stored.buildRunId } : undefined,
    run as DurableBuildRunCandidate | null,
    selectedProjectRecords as DurableBuildRunCandidate[],
    allRecords as DurableBuildRunCandidate[],
  );
  if (latest && latest.id !== run?.id) run = await loadDurableBuildRun(userId, latest.id);
  const selection = run
    ? await saveWorkspaceSelection(userId, { projectId: run.projectId, conversationId: run.conversationId, buildRunId: run.id })
    : stored?.buildRunId
      ? await saveWorkspaceSelection(userId, { projectId: stored.projectId, conversationId: stored.conversationId, buildRunId: null })
      : stored;
    return {
    selection: selection ? { projectId: selection.projectId, conversationId: selection.conversationId, buildRunId: selection.buildRunId } : null,
    run,
  };
}

async function selectedBuildRunForRequest(userId: number, requestedBuildRunId?: string | null) {
  const restored = await restoreWorkspaceSelection(userId);
  if (requestedBuildRunId) return await loadDurableBuildRun(userId, requestedBuildRunId);
  return restored.run;
}
/** Coalesces concurrent startup requests so one account receives one initial workspace. */
async function prepareWorkspaceForUser(userId: number): Promise<PreparedWorkspaceResponse> {
  const inFlight = activeWorkspaceProvisioning.get(userId);
  if (inFlight) return inFlight;
  const operation = (async () => {
    const restored = await restoreWorkspaceSelection(userId);
    const prepared = await prepareAccountWorkspace({
      userId,
      restored: {
        selection: restored.selection,
        run: restored.run ? { id: restored.run.id, projectId: restored.run.projectId, conversationId: restored.run.conversationId } : null,
      },
      repository: {
        listProjects,
        createProject,
        listConversations,
        createConversation,
        saveSelection: saveWorkspaceSelection,
      },
    });
    const run = restored.run && restored.run.id === prepared.selection.buildRunId ? restored.run : null;
    return { ...prepared, run };
  })();
  activeWorkspaceProvisioning.set(userId, operation);
  void operation.finally(() => {
    if (activeWorkspaceProvisioning.get(userId) === operation) activeWorkspaceProvisioning.delete(userId);
  });
  return operation;
}

function buildPersistence() {
  const localDevelopment = !process.env.DATABASE_URL?.trim();
  return {
    workspaceArtifactsAreAuthoritative: localDevelopment,
    getProjectName: async (userId: number, projectId: number) => (await getProjectForUser(userId, projectId))?.name || null,
    generateWorkspaceName,
    updateProjectDetails: async (...args: Parameters<typeof updateProjectDetails>) => {
      if (localDevelopment) return undefined;
      return updateProjectDetails(...args);
    },
    updateProjectBuildStatus: async (...args: Parameters<typeof updateProjectBuildStatus>) => {
      if (localDevelopment) return undefined;
      return updateProjectBuildStatus(...args);
    },
    addGeneratedFile: (
      ownerId: number,
      workspaceProjectId: number,
      workspaceConversationId: number,
      artifact: { path: string; language: ArtifactLanguage; content: string },
      buildRunId?: string,
    ) => localDevelopment
      ? Promise.resolve(0)
      : addGeneratedFile(ownerId, workspaceProjectId, workspaceConversationId, artifact.path, artifact.language, artifact.content, buildRunId),
    listGeneratedFilesForBuildRun: localDevelopment ? listLocalProductionAgentArtifacts : listGeneratedFilesForBuildRun,
    deleteGeneratedFileForBuildRun: localDevelopment
      ? async (ownerId: number, workspaceProjectId: number, workspaceConversationId: number, buildRunId: string, filePath: string) => {
        await removeLocalProductionAgentArtifact({ userId: ownerId, projectId: workspaceProjectId, conversationId: workspaceConversationId, buildRunId }, filePath);
        return true;
      }
      : deleteGeneratedFileForBuildRun,
    claimLegacyGeneratedFilesForBuildRun,
    appendProjectEvent: async (...args: Parameters<typeof appendProjectEvent>) => {
      if (localDevelopment) return undefined;
      return appendProjectEvent(...args);
    },
    saveBuildRun: saveBuildRunSnapshot,
    productionAgentQueue: localDevelopment ? localProductionAgentQueueHooks : durableProductionAgentQueueHooks,
  };
}

function inheritedArtifactLanguage(relativePath: string): ArtifactLanguage {
  const extension = path.extname(relativePath).toLowerCase();
  if (extension === ".html") return "html";
  if (extension === ".css") return "css";
  if (extension === ".md") return "markdown";
  if (extension === ".json") return "json";
  if (extension === ".sql") return "sql";
  return "javascript";
}

async function inheritBuildRunArtifacts(sourceRun: BuildRun, targetRun: BuildRun, persistence: ReturnType<typeof buildPersistence>) {
  const sourceRoot = path.resolve(sourceRun.workspaceRoot);
  const targetRoot = path.resolve(targetRun.workspaceRoot);
  if (sourceRun.manifest && targetRun.manifest) {
    targetRun.manifest.projectVersion = sourceRun.manifest.projectVersion + 1;
    targetRun.manifest.updatedAt = new Date().toISOString();
    const filesByPath = new Map(sourceRun.manifest.files.map(file => [file.path, file]));
    for (const file of targetRun.manifest.files) filesByPath.set(file.path, file);
    targetRun.manifest.files = Array.from(filesByPath.values());
    targetRun.manifest.featureIds = Array.from(new Set([...sourceRun.manifest.featureIds, ...targetRun.manifest.featureIds]));
    targetRun.manifest.screenIds = Array.from(new Set([...sourceRun.manifest.screenIds, ...targetRun.manifest.screenIds]));
    targetRun.manifest.interactionIds = Array.from(new Set([...sourceRun.manifest.interactionIds, ...targetRun.manifest.interactionIds]));
    targetRun.manifest.componentIds = Array.from(new Set([...sourceRun.manifest.componentIds, ...targetRun.manifest.componentIds]));
    targetRun.manifest.fileOwnership = [...sourceRun.manifest.fileOwnership, ...targetRun.manifest.fileOwnership]
      .filter((item, index, all) => all.findIndex(candidate => candidate.featureId === item.featureId) === index);
    targetRun.manifest.previewAcceptanceCriteria = [...sourceRun.manifest.previewAcceptanceCriteria, ...targetRun.manifest.previewAcceptanceCriteria]
      .filter((item, index, all) => all.findIndex(candidate => candidate.id === item.id) === index);
  }
  const sourceArtifacts = Array.from(new Map(sourceRun.artifacts.map(artifact => [artifact.path, artifact])).values());
  for (const artifact of sourceArtifacts) {
    const relativePath = artifact.path.replace(/\\/g, "/");
    const segments: string[] = relativePath.split("/");
    if (
      !relativePath ||
      path.isAbsolute(relativePath) ||
      segments.some(segment => !segment || segment === "." || segment === ".." || /^\.env(?:\.|$)/i.test(segment)) ||
      segments.includes("node_modules") ||
      relativePath.startsWith("evidence/") ||
      relativePath.startsWith("agent-artifacts/") ||
      /\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip)$/i.test(relativePath)
    ) continue;
    const sourcePath = path.resolve(sourceRoot, ...segments);
    const destination = path.resolve(targetRoot, ...segments);
    if (
      !sourcePath.startsWith(`${sourceRoot}${path.sep}`) ||
      !destination.startsWith(`${targetRoot}${path.sep}`)
    ) throw new Error("BUILD_SOURCE_ARTIFACT_PATH_INVALID");
    const content = await readFile(sourcePath, "utf8");
    if (!content.trim() && ["index.html", "styles.css"].includes(relativePath)) {
      throw new Error("SOURCE_BUILD_RUN_NOT_READY");
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
    targetRun.artifacts.push({ path: relativePath, size: Buffer.byteLength(content, "utf8") });
    targetRun.generatedFileIds.push(await persistence.addGeneratedFile(
      targetRun.userId,
      targetRun.projectId,
      targetRun.conversationId,
      { path: relativePath, language: inheritedArtifactLanguage(relativePath), content },
      targetRun.id,
    ));
  }
  await saveBuildRunSnapshot(targetRun);
}

async function advanceBuildRun(run: BuildRun, persistence = buildPersistence()): Promise<BuildRun> {
  if (!projectImplementationEnabled()) throw new Error("BUILD_EXECUTION_DISABLED");
  const existing = activeBuildSteps.get(run.id);
  if (existing) return existing;
  const step = (async () => {
    if (!(await getDb())) {
      const leaseToken = crypto.randomUUID();
      const claimed = await claimLocalBuildRunAdvancement(run.userId, run.id, leaseToken, localBuildRunStateRoot);
      if (!claimed) return snapshotAfterRejectedLease(
        () => loadDurableBuildRun(run.userId, run.id, { forceDurable: true }),
        run,
      );
      try {
        const durableSnapshot = await loadDurableBuildRun(run.userId, run.id, { forceDurable: true });
        return await continueVerifiedBuild(authoritativeBuildRunSnapshot(run, durableSnapshot), persistence);
      } finally {
        try {
          const released = await releaseLocalBuildRunAdvancement(run.userId, run.id, leaseToken, localBuildRunStateRoot);
          if (!released) console.warn("[BuildRun] Local advancement lease was no longer owned by this worker", run.id);
        } catch (error) {
          console.warn("[BuildRun] Could not release local advancement lease", publicText(error instanceof Error ? error.message : error));
        }
      }
    }
    const leaseToken = crypto.randomUUID();
    const claimed = await claimDurableBuildRunAdvancement(run.userId, run.id, leaseToken, BUILD_RUN_ADVANCEMENT_LEASE_MS);
    if (!claimed) return snapshotAfterRejectedLease(
      () => loadDurableBuildRun(run.userId, run.id, { forceDurable: true }),
      run,
    );
    const renewal = startAdvancementLeaseRenewal(run, leaseToken);
    try {
      const durableSnapshot = await loadDurableBuildRun(run.userId, run.id, { forceDurable: true });
      return await continueVerifiedBuild(
        authoritativeBuildRunSnapshot(run, durableSnapshot),
        leaseScopedBuildPersistence(persistence, leaseToken),
      );
    } catch (error) {
      if (error instanceof BuildRunAdvancementLeaseLostError) return (await loadDurableBuildRun(run.userId, run.id, { forceDurable: true })) ?? run;
      throw error;
    } finally {
      clearInterval(renewal);
      await releaseDurableBuildRunAdvancement(run.userId, run.id, leaseToken).catch(error => {
        console.warn("[BuildRun] Could not release advancement lease", publicText(error instanceof Error ? error.message : error));
      });
    }
  })().finally(() => activeBuildSteps.delete(run.id));
  activeBuildSteps.set(run.id, step);
  return step;
}

function startAdvancementLeaseRenewal(run: BuildRun, leaseToken: string) {
  const renew = async () => {
    try {
      const renewed = await renewDurableBuildRunAdvancement(run.userId, run.id, leaseToken, BUILD_RUN_ADVANCEMENT_LEASE_MS);
      if (!renewed) console.warn("[BuildRun] Advancement lease renewal was rejected", run.id);
    } catch (error) {
      console.warn("[BuildRun] Could not renew advancement lease", run.id, publicText(error instanceof Error ? error.message : error));
    }
  };
  const timer = setInterval(() => { void renew(); }, BUILD_RUN_ADVANCEMENT_RENEW_INTERVAL_MS);
  timer.unref();
  return timer;
}

async function removeBuildHeartbeat(run: BuildRun) {
  if (!run.heartbeatTaskUid) return;
  const taskUid = run.heartbeatTaskUid;
  run.heartbeatTaskUid = undefined;
  await saveBuildRunSnapshot(run);
  try {
    // Project-owner jobs avoid retaining an end-user OAuth token in a Build Run.
    await deleteHeartbeatJob(taskUid, "");
  } catch (error) {
    console.warn("[BuildHeartbeat] Failed to delete terminal job", publicText(error instanceof Error ? error.message : error));
  }
}

async function advanceAndFinalizeBuildRun(run: BuildRun) {
  const progressed = await advanceBuildRun(run);
  if (isTerminalBuildStatus(progressed.status)) await removeBuildHeartbeat(progressed);
  return progressed;
}

async function requireUser(req: Request, res: Response) {
  const ctx = await createContext({ req, res, info: {} as never });
  if (ctx.isDemo) {
    res.status(403).json({ code: "DEMO_MODE_RESTRICTED", error: "Demo mode cannot access production workspace data." });
    return null;
  }

  if (!ctx.user) {
    res.status(401).json({ code: "AUTHENTICATION_REQUIRED", error: "Sign in to SmartBuild to access this workspace." });
    return null;
  }
  return ctx.user;
}

function respondBuildDisabled(res: Response, code: string, error: string): boolean {
  res.status(410).json({ code, error });
  return true;
}

function projectImplementationEnabled(): boolean {
  return false;
}

async function requireVerifiedFirstPartyAccount(req: Request, res: Response) {
  const token = readCookie(req.headers.cookie, FIRST_PARTY_SESSION_COOKIE);
  const account = token ? await getFirstPartySessionAccount(hashSessionToken(token)) : undefined;
  if (!account) {
    res.status(401).json({ code: "AUTHENTICATION_REQUIRED", error: "Sign in with a verified SmartBuild account to continue." });
    return null;
  }
  return account;
}

async function requireProject(req: Request, res: Response) {
  const user = await requireUser(req, res);
  if (!user) return null;
  const projectId = numeric(req.params.projectId);
  if (!projectId) {
    res.status(400).json({ error: "A valid project ID is required." });
    return null;
  }
  const project = await getProjectForUser(user.id, projectId);
  if (!project || project.archivedAt) {
    res.status(404).json({ error: "Project not found." });
    return null;
  }
  return { user, project };
}

async function projectReportSnapshot(userId: number, project: { id: number; name: string; description?: string | null; createdAt?: Date | string | null; updatedAt?: Date | string | null }): Promise<ProjectReportSnapshot> {
  const [conversations, generatedFiles, events] = await Promise.all([
    listConversations(userId, project.id),
    listGeneratedFiles(userId, project.id),
    listProjectEvents(userId, project.id),
  ]);
  const activity = await Promise.all(conversations.map(async conversation => {
    const [messages, sources, uploads] = await Promise.all([
      getConversationMessages(userId, conversation.id),
      listResearchSources(userId, conversation.id),
      listUploads(userId, conversation.id),
    ]);
    return { messages: messages.length, sources: sources.length, uploads: uploads.length };
  }));
  return {
    project,
    conversations,
    generatedFiles,
    events,
    messageCount: activity.reduce((total, item) => total + item.messages, 0),
    sourceCount: activity.reduce((total, item) => total + item.sources, 0),
    uploadCount: activity.reduce((total, item) => total + item.uploads, 0),
  };
}

function findAvailablePort(startPort = 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      if (port >= startPort + 20) return reject(new Error("No port available"));
      const tester = net.createServer();
      tester.once("error", () => tryPort(port + 1));
      tester.once("listening", () => tester.close(() => resolve(port)));
      tester.listen(port);
    };
    tryPort(startPort);
  });
}

async function startServer() {
  const app = express();
  configureTrustedProxy(app);

  const server = createServer(app);

  app.use(express.json({ limit: "2mb" }));

  registerMediaCheckRoutes(app, {
    requireAccount: requireVerifiedFirstPartyAccount,
    verifyProvider: verifyGeminiProvider,
    analyze: analyzeGeminiMedia,
    checkProvenance: verifyMediaProvenance,
    provenanceVerifierReady: isMediaProvenanceVerifierReady,
  });
  registerStorageProxy(app);

  const sendAuthError = (res: Response, error: unknown) => {
    if (error instanceof FirstPartyAuthError) {
      const status = error.code === "RATE_LIMITED" ? 429 : error.code === "DELIVERY_BLOCKED" || error.code === "UNAVAILABLE" ? 503 : error.code === "EMAIL_NOT_VERIFIED" ? 403 : error.code === "INVALID_CREDENTIALS" || error.code === "INVALID_OTP" || error.code === "OTP_EXPIRED" ? 400 : 422;
      return res.status(status).json({
        code: error.code,
        error: error.message,
        ...(error.diagnosticCode ? { diagnosticCode: publicResendDiagnosticCode(error.diagnosticCode) } : {}),
        ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      });
    }
    return res.status(500).json({ code: "UNAVAILABLE", error: "Authentication is temporarily unavailable." });
  };
  let emailAvailabilityCache: { checkedAt: number; value: ReturnType<typeof publicEmailAvailability> } | null = null;
  const emailAvailability = async () => {
    if (emailAvailabilityCache && Date.now() - emailAvailabilityCache.checkedAt < 60_000) return emailAvailabilityCache.value;
    const status = await verifyEmailProvider();
    const value = publicEmailAvailability(status);
    emailAvailabilityCache = { checkedAt: Date.now(), value };
    return value;
  };

  app.get("/api/auth/status", async (req, res) => {
    const context = await createContext({ req, res, info: {} as never });
    res.json({ authenticated: Boolean(context.user), sessionType: context.authMode, emailVerification: await emailAvailability() });
  });
  app.post("/api/site-analytics/activity", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const origin = req.get("origin");
    if (origin) {
      try {
        if (new URL(origin).origin !== `${req.protocol}://${req.get("host")}`) {
          res.status(403).json({ error: "Cross-origin analytics requests are not accepted." });
          return;
        }
      } catch {
        res.status(403).json({ error: "Invalid request origin." });
        return;
      }
    }
    const clientSessionId = req.body?.sessionId;
    if (typeof clientSessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientSessionId)) {
      res.status(400).json({ error: "A valid analytics session ID is required." });
      return;
    }
    let visitorToken = readCookie(req.headers.cookie, SITE_ANALYTICS_VISITOR_COOKIE);
    if (!visitorToken || !/^[A-Za-z0-9_-]{40,60}$/.test(visitorToken)) {
      visitorToken = crypto.randomBytes(32).toString("base64url");
      res.cookie(SITE_ANALYTICS_VISITOR_COOKIE, visitorToken, siteAnalyticsCookieOptions(req));
    }
    const visitorKey = siteAnalyticsHash(visitorToken);
    if (!permitSiteAnalyticsWrite(visitorKey)) {
      res.status(429).json({ error: "Analytics activity is temporarily rate-limited." });
      return;
    }
    const context = await createContext({ req, res, info: {} as never });
    const account = await verifiedAnalyticsAccount(req);
    const sessionKey = siteAnalyticsHash(`${visitorToken}:${clientSessionId}`);
    try {
      await recordSiteAnalyticsActivity({
        sessionKey,
        visitorKey,
        accountId: account?.id ?? null,
        guestUserId: context.authMode === "guest" ? context.user?.id ?? null : null,
        ended: req.body?.ended === true,
      });
      res.status(204).end();
    } catch (error) {
      console.error("[site-analytics] Could not record session activity:", error);
      res.status(503).json({ error: "Analytics activity could not be saved." });
    }
  });
  app.get("/api/site-analytics/owner", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const account = await verifiedAnalyticsAccount(req);
      if (!account || account.email.toLowerCase() !== SITE_ANALYTICS_OWNER_EMAIL) {
        res.status(403).json({ error: "Owner access is required." });
        return;
      }
      res.json(await getSiteAnalyticsDashboard());
    } catch (error) {
      console.error("[site-analytics] Could not load owner dashboard:", error);
      res.status(503).json({ error: "Analytics are temporarily unavailable." });
    }
  });
  app.post("/api/auth/demo-login", (req, res) => {
    try {
      const session = createDemoSession();
      res.cookie(DEMO_SESSION_COOKIE, session.token, authCookieOptions(req, session.expiresAt));
      res.json({ state: "demo", expiresAt: session.expiresAt.toISOString() });
    } catch (error) { sendAuthError(res, error); }
  });
  app.post("/api/auth/demo-logout", (req, res) => {
    res.clearCookie(DEMO_SESSION_COOKIE, authCookieOptions(req));
    res.json({ state: "demo_signed_out" });
  });
  app.post("/api/auth/guest", async (req, res) => {
    if (!permitGuestSessionCreation(req.ip || req.socket.remoteAddress || "unknown")) {
      return res.status(429).json({ error: "Too many guest sessions. Please try again later." });
    }
    const nickname = typeof req.body?.nickname === "string" ? req.body.nickname.trim().replace(/\s+/g, " ") : "";
    if (nickname.length < 2 || nickname.length > 40) {
      return res.status(400).json({ error: "Nickname must be between 2 and 40 characters." });
    }
    try {
      const user = await upsertUser({
        openId: `guest_${crypto.randomUUID()}`,
        name: nickname,
        loginMethod: "guest",
        role: "user",
      });
      if (!user) return res.status(503).json({ error: "The guest workspace could not be created." });
      const session = createGuestSession(user.id);
      res.clearCookie(DEMO_SESSION_COOKIE, authCookieOptions(req));
      res.clearCookie(FIRST_PARTY_SESSION_COOKIE, authCookieOptions(req));
      res.clearCookie(REMEMBERED_SESSION_COOKIE, authCookieOptions(req));
      res.cookie(GUEST_SESSION_COOKIE, session.token, authCookieOptions(req, session.expiresAt));
      res.json({ state: "guest", expiresAt: session.expiresAt.toISOString() });
    } catch (error) {
      console.error("[auth] Could not create guest workspace.", error);
      res.status(503).json({ error: "The guest workspace could not be created." });
    }
  });
  app.post("/api/auth/signup", async (req, res) => {
    try { res.status(201).json(await signUpWithEmail({ email: typeof req.body?.email === "string" ? req.body.email : "", password: typeof req.body?.password === "string" ? req.body.password : "", name: typeof req.body?.name === "string" ? req.body.name : undefined })); }
    catch (error) { sendAuthError(res, error); }
  });
  app.post("/api/auth/verify-email", async (req, res) => {
    try { res.json({ state: "verified", ...(await verifyEmailOtp({ email: typeof req.body?.email === "string" ? req.body.email : "", otp: typeof req.body?.otp === "string" ? req.body.otp : "" })) }); }
    catch (error) { sendAuthError(res, error); }
  });
  app.post("/api/auth/resend-verification", async (req, res) => {
    try { res.json(await resendVerificationOtp(typeof req.body?.email === "string" ? req.body.email : "")); }
    catch (error) { sendAuthError(res, error); }
  });
  app.post("/api/auth/login", async (req, res) => {
    try {
      const session = await loginWithEmail({ email: typeof req.body?.email === "string" ? req.body.email : "", password: typeof req.body?.password === "string" ? req.body.password : "" });
      res.clearCookie(DEMO_SESSION_COOKIE, authCookieOptions(req));
      res.clearCookie(GUEST_SESSION_COOKIE, authCookieOptions(req));
      res.cookie(FIRST_PARTY_SESSION_COOKIE, session.token, authCookieOptions(req, session.expiresAt));
      res.json({ state: "authenticated" });
    } catch (error) { sendAuthError(res, error); }
  });
  app.post("/api/auth/forgot-password", async (req, res) => {
    try { await requestPasswordReset(typeof req.body?.email === "string" ? req.body.email : ""); res.json({ state: "accepted" }); }
    catch (error) { sendAuthError(res, error); }
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    try { await resetPasswordWithOtp({ email: typeof req.body?.email === "string" ? req.body.email : "", otp: typeof req.body?.otp === "string" ? req.body.otp : "", password: typeof req.body?.password === "string" ? req.body.password : "" }); res.json({ state: "password_reset" }); }
    catch (error) { sendAuthError(res, error); }
  });
  app.post("/api/auth/logout", async (req, res) => {
    const token = readCookie(req.headers.cookie, FIRST_PARTY_SESSION_COOKIE);
    const remember = req.body?.remember === true;
    if (remember && token) res.cookie(REMEMBERED_SESSION_COOKIE, token, authCookieOptions(req));
    else {
      await logoutFirstPartySession(token || readCookie(req.headers.cookie, REMEMBERED_SESSION_COOKIE));
      res.clearCookie(REMEMBERED_SESSION_COOKIE, authCookieOptions(req));
    }
    res.clearCookie(FIRST_PARTY_SESSION_COOKIE, authCookieOptions(req));
    res.clearCookie(DEMO_SESSION_COOKIE, authCookieOptions(req));
    res.clearCookie(GUEST_SESSION_COOKIE, authCookieOptions(req));
    res.json({ state: "signed_out" });
  });
  app.post("/api/auth/test-email", async (_req, res) => {
    // The provider ignores request data and always sends only to
    // FIRST_PARTY_OWNER_EMAIL; no account, OTP, recipient, or secret is exposed.
    const delivery = await sendResendDiagnosticEmail();
    emailAvailabilityCache = null;
    if (delivery.state === "sent") return res.status(202).json({ state: "sent", messageId: delivery.messageId });
    return res.status(503).json({
      state: "blocked",
      diagnosticCode: publicResendDiagnosticCode(delivery.diagnosticCode),
      error: "Email verification is temporarily unavailable.",
    });
  });

  app.get("/api/providers/status", async (_req, res) => {
    const [ollama, gemini] = await Promise.all([verifyOllamaProvider(), verifyGeminiProvider()]);
    const providers = getProviderStatus().map(provider => {
      if (provider.id === "ollama") return { ...provider, state: ollama.state, reason: ollama.reason };
      if (provider.id === "gemini") return { ...provider, state: gemini.state, reason: gemini.reason };
      return provider;
    });
    res.json({ providers, pythonRuntime: pythonRuntimeStatus() });
  });

  // The browser receives only the current first-party authentication state;
  // it never receives another user's workspace identity or data.
  app.get("/api/workspace/session", async (req, res) => {
    const context = await createContext({ req, res, info: {} as never });
    res.json({ authenticated: Boolean(context.user), authMode: context.authMode, isDemo: context.isDemo });
  });

  app.get("/api/workspace/legacy-claim", async (req, res) => {
    const account = await requireVerifiedFirstPartyAccount(req, res);
    if (!account) return;
    const claim = await getLegacyWorkspaceClaimState(account.id);
    res.json({ state: claim.state });
  });

  app.post("/api/workspace/legacy-claim", async (req, res) => {
    const account = await requireVerifiedFirstPartyAccount(req, res);
    if (!account) return;
    const claim = await claimLegacyWorkspaceForAccount(account.id);
    res.json({ state: claim.state });
  });

  app.post("/api/personal/bootstrap", (_req, res) => {
    return res.status(410).json({ code: "FIRST_PARTY_AUTH_REQUIRED", error: "Sign in to SmartBuild before creating a workspace." });
  });

  app.get("/api/cloud/status", async (req, res) => {
    const user = await requireUser(req, res);
    if (user) res.json(cloudWorkspaceStatus());
  });

  app.get("/api/cloud/files", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const requestedBuildRunId = typeof req.query.buildRunId === "string" ? req.query.buildRunId : null;
      const run = await selectedBuildRunForRequest(user.id, requestedBuildRunId);
      if (run) {
        await restoreBuildWorkspace(run, buildPersistence());
        return res.json({ files: listBuildWorkspaceFiles(run.id), buildRunId: run.id });
      }
      res.json({ files: await listCloudWorkspaceFiles(typeof req.query.path === "string" ? req.query.path : ""), buildRunId: null });
    } catch (error) {
      const safe = toCloudWorkspaceError(error);
      res.status(400).json({ error: safe.message, code: safe.code });
    }
  });

  app.get("/api/cloud/file", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const filePath = typeof req.query.path === "string" ? req.query.path : "";
      const requestedBuildRunId = typeof req.query.buildRunId === "string" ? req.query.buildRunId : null;
      const run = await selectedBuildRunForRequest(user.id, requestedBuildRunId);
      if (run) return res.json({ ...(await readBuildWorkspaceFile(run.id, filePath, buildPersistence())), buildRunId: run.id });
      res.json(await readCloudWorkspaceFile(filePath));
    } catch (error) {
      const safe = toCloudWorkspaceError(error);
      res.status(400).json({ error: safe.message, code: safe.code });
    }
  });

  app.put("/api/cloud/file", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (respondBuildDisabled(res, "WORKSPACE_WRITES_DISABLED", "Workspace files are read-only. Existing files are preserved.")) return;
    const filePath = typeof req.body?.path === "string" ? req.body.path : "";
    const content = typeof req.body?.content === "string" ? req.body.content : null;
    if (content === null) return res.status(400).json({ error: "File content is required." });
    try {
      res.status(201).json(await writeCloudWorkspaceFile(filePath, content));
    } catch (error) {
      const safe = toCloudWorkspaceError(error);
      res.status(400).json({ error: safe.message, code: safe.code });
    }
  });

  app.delete("/api/cloud/file", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (respondBuildDisabled(res, "WORKSPACE_WRITES_DISABLED", "Workspace files are read-only. Existing files are preserved.")) return;
    const filePath = typeof req.query.path === "string" ? req.query.path : "";
    try {
      res.json(await deleteCloudWorkspaceFile(filePath));
    } catch (error) {
      const safe = toCloudWorkspaceError(error);
      res.status(400).json({ error: safe.message, code: safe.code });
    }
  });

  app.post("/api/cloud/upload", express.raw({ type: "application/octet-stream", limit: "1mb" }), async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (respondBuildDisabled(res, "WORKSPACE_WRITES_DISABLED", "Workspace uploads are disabled. Existing files are preserved.")) return;
    const filePath = typeof req.query.path === "string" ? req.query.path : "";
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    try {
      res.status(201).json(await uploadCloudWorkspaceFile(filePath, bytes));
    } catch (error) {
      const safe = toCloudWorkspaceError(error);
      res.status(400).json({ error: safe.message, code: safe.code });
    }
  });

  app.get("/api/cloud/export.zip", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const requestedBuildRunId = typeof req.query.buildRunId === "string" ? req.query.buildRunId : null;
      const restored = await restoreWorkspaceSelection(user.id);
      let run = restored.run;
      if (requestedBuildRunId && run?.id !== requestedBuildRunId) {
        run = await loadDurableBuildRun(user.id, requestedBuildRunId);
      }
      if (!run) return res.status(404).json({ error: "The selected persisted build is unavailable." });
      if (run.error?.code === "BUILD_EXECUTION_MODE_REQUIRED") {
        return res.status(409).json({ error: "The selected Build Run is blocked because its durable execution mode is unavailable.", code: run.error.code });
      }
      const zip = await exportBuildWorkspaceZip(run.id, buildPersistence());
      if (zip.length < 4 || zip.subarray(0, 2).toString("utf8") !== "PK") throw new Error("BUILD_EXPORT_UNAVAILABLE");
      res.setHeader("content-type", "application/zip");
      res.setHeader("content-disposition", "attachment; filename=smartbuild-cloud-workspace.zip");
      res.setHeader("content-length", zip.length);
      // ZIP bytes are Build-Run-specific evidence. This prevents a browser or
      // intermediary from reusing an earlier Bella download for a newly
      // selected Maya run at the same endpoint.
      res.setHeader("cache-control", "private, no-store, max-age=0");
      res.vary("Cookie");
      res.setHeader("x-smartbuild-build-run-id", run.id);
      res.send(zip);
    } catch (error) {
      const safe = toCloudWorkspaceError(error);
      res.status(400).json({ error: safe.message, code: safe.code });
    }
  });

  app.get("/api/cloud/changes", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { stdout: status } = await execFileAsync("git", ["status", "--short"], { cwd: process.cwd(), timeout: 10_000, maxBuffer: 64 * 1024 });
      const { stdout: summary } = await execFileAsync("git", ["diff", "--stat"], { cwd: process.cwd(), timeout: 10_000, maxBuffer: 64 * 1024 });
      res.json({ status: status.trim().split("\n").filter(Boolean).slice(0, 100), summary: summary.trim().split("\n").filter(Boolean).slice(0, 40) });
    } catch {
      res.json({ status: [], summary: ["Git changes are unavailable in this Cloud workspace."] });
    }
  });

  app.get("/api/cloud/logs", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { stdout } = await execFileAsync("git", ["log", "-5", "--pretty=format:%h%x09%s"], { cwd: process.cwd(), timeout: 10_000, maxBuffer: 32 * 1024 });
      res.json({ entries: stdout.trim().split("\n").filter(Boolean).map(line => { const [id, ...message] = line.split("\t"); return { id, message: message.join("\t") }; }) });
    } catch {
      res.json({ entries: [] });
    }
  });

  app.get("/api/cloud/diff", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const revision = typeof req.query.revision === "string" ? req.query.revision : "";
    try {
      res.json(await readCloudRevisionDiff(revision));
    } catch (error) {
      if (error instanceof CloudDiffError) {
        const status = error.code === "INVALID_REVISION" ? 400 : error.code === "REVISION_UNAVAILABLE" ? 404 : 422;
        return res.status(status).json({ error: error.message, code: error.code });
      }
      res.status(500).json({ error: "Cloud checkpoint diff could not be loaded." });
    }
  });

  app.post("/api/cloud/rollback", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (respondBuildDisabled(res, "WORKSPACE_WRITES_DISABLED", "Changing workspace files is disabled. Existing files are preserved.")) return;
    const revision = typeof req.body?.revision === "string" ? req.body.revision.trim() : "";
    const confirmation = typeof req.body?.confirmation === "string" ? req.body.confirmation.trim() : "";
    try {
      res.json(await rollbackCloudWorkspace(revision, confirmation));
    } catch (error) {
      if (error instanceof CloudRollbackError) {
        const status = error.code === "CONFIRMATION_REQUIRED" ? 409 : error.code === "REVISION_UNAVAILABLE" ? 404 : 400;
        return res.status(status).json({ error: error.message, code: error.code });
      }
      res.status(500).json({ error: "Cloud checkpoint restore could not be completed." });
    }
  });

  app.get("/api/workspace/projects", async (req, res) => {
    const user = await requireUser(req, res);
    if (user) {
      const selection = await getWorkspaceSelection(user.id);
      const archive = req.query.status === "archived" ? "archived" : req.query.status === "all" ? "all" : "active";
      let rows = await listProjects(user.id, archive);
      if (!rows.length && archive === "active") {
        const project = await createProject(user.id, "My workspace", "Private SmartBuild workspace for this account.");
        if (project) {
          const conversation = await createConversation(user.id, project.id, "New build");
          await saveWorkspaceSelection(user.id, { projectId: project.id, conversationId: conversation?.id ?? null, buildRunId: null });
          rows = [project];
        }
      }
      res.json(collapseLogicalWorkspaceProjects(rows, selection?.projectId));
    }
  });

  app.post("/api/workspace/bootstrap", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const prepared = await prepareWorkspaceForUser(user.id);
      res.json({
        project: prepared.project,
        conversation: prepared.conversation,
        selection: prepared.selection,
        run: prepared.run ? publicBuildRun(prepared.run) : null,
        created: { project: prepared.createdProject, conversation: prepared.createdConversation },
      });
    } catch {
      res.status(503).json({ code: "WORKSPACE_PROVISIONING_UNAVAILABLE", error: "Your workspace could not be created. Try again." });
    }
  });

  app.get("/api/workspace/selection", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const restored = await restoreWorkspaceSelection(user.id);
    // Keep the nested form for the current client and mirror the selection
    // fields at top level for previous public clients and direct diagnostics.
    res.json({ ...(restored.selection || { projectId: null, conversationId: null, buildRunId: null }), selection: restored.selection, run: restored.run ? publicBuildRun(restored.run) : null });
  });

  app.get("/api/workspace/health", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const requestedBuildRunId = typeof req.query.buildRunId === "string" && req.query.buildRunId.trim() ? req.query.buildRunId.trim() : null;
    const restored = requestedBuildRunId ? null : await restoreWorkspaceSelection(user.id);
    const run: BuildRun | null = requestedBuildRunId ? await loadDurableBuildRun(user.id, requestedBuildRunId, { forceDurable: true }) : restored?.run ?? null;
    const selection = selectionForDiagnosticRun(restored?.selection ?? null, run);
    if (!run) return res.json(createWorkspaceDiagnostic({ selection, run: null, artifactCount: 0, previewStatus: "not-requested", exportStatus: "not-requested" }));
    if (run.error?.code === "BUILD_EXECUTION_MODE_REQUIRED") {
      return res.json(createWorkspaceDiagnostic({ selection, run, artifactCount: 0, previewStatus: "unavailable", exportStatus: "unavailable" }));
    }

    let artifactCount = 0;
    let previewStatus: "ready" | "unavailable" = "unavailable";
    let previewHttpStatus: number | null = null;
    let exportStatus: "ready" | "unavailable" = "unavailable";
    let exportHttpStatus: number | null = null;
    try {
      await restoreBuildWorkspace(run, buildPersistence());
      artifactCount = listBuildWorkspaceFiles(run.id).length;
      await ensureBuildPreview(run, buildPersistence());
      if (run.preview?.url) {
        const previewResponse = await fetch(run.preview.url, { signal: AbortSignal.timeout(1_000) });
        previewHttpStatus = previewResponse.status;
        previewStatus = previewResponse.ok ? "ready" : "unavailable";
      }
      const zip = await exportBuildWorkspaceZip(run.id, buildPersistence());
      if (zip.length >= 4 && zip.subarray(0, 2).toString("utf8") === "PK") {
        exportStatus = "ready";
        exportHttpStatus = 200;
      }
    } catch {
      // Diagnostic status deliberately remains structured and does not expose
      // filesystem paths, provider tokens, or raw process output.
    }
    res.json(createWorkspaceDiagnostic({ selection, run, artifactCount, previewStatus, previewHttpStatus, exportStatus, exportHttpStatus }));
  });

  app.get("/api/workspace/truth-engine", async (req, res) => {
    const account = await requireVerifiedFirstPartyAccount(req, res);
    if (!account) return;
    const claimState = await getLegacyWorkspaceClaimState(account.id);
    if (claimState.state !== "claimed") {
      return res.status(409).json({ code: "OWNER_BINDING_REQUIRED", error: "Truth Engine remains unavailable until the verified owner binding is confirmed." });
    }
    const user = await requireUser(req, res);
    if (!user) return;
    const requestedBuildRunId = typeof req.query.buildRunId === "string" && req.query.buildRunId.trim() ? req.query.buildRunId.trim() : null;
    const requestedProjectId = numeric(req.query.projectId);
    const requestedConversationId = numeric(req.query.conversationId);
    const restored = requestedBuildRunId
      ? { run: await loadDurableBuildRun(user.id, requestedBuildRunId) }
      : await restoreWorkspaceSelection(user.id);
    const run = restored.run;
    if (requestedBuildRunId && (!run || (requestedProjectId && run.projectId !== requestedProjectId) || (requestedConversationId && run.conversationId !== requestedConversationId))) {
      return res.status(409).json({ code: "BUILD_RUN_TUPLE_MISMATCH", error: "Truth Engine evidence does not match the selected Build Run tuple." });
    }
    if (!run) return res.json(evaluateTruthEngine({ run: null, sourceArtifactCount: 0, previewReady: false, exportReady: false }));

    let sourceArtifactCount = 0;
    let previewReady = false;
    let exportReady = false;
    try {
      await restoreBuildWorkspace(run, buildPersistence());
      sourceArtifactCount = listBuildWorkspaceFiles(run.id).filter(file => !file.path.startsWith("evidence/")).length;
      await readBuildPreview(run);
      previewReady = true;
      const zip = await exportBuildWorkspaceZip(run.id, buildPersistence());
      exportReady = zip.length >= 4 && zip.subarray(0, 2).toString("utf8") === "PK";
    } catch {
      // The report records unavailable durable evidence without exposing
      // filesystem, process, provider, or session details.
    }
    res.json(evaluateTruthEngine({ run, sourceArtifactCount, previewReady, exportReady }));
  });

  app.put("/api/workspace/selection", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const projectId = numeric(req.body?.projectId);
    const conversationId = numeric(req.body?.conversationId);
    const buildRunId = typeof req.body?.buildRunId === "string" && req.body.buildRunId.trim() ? req.body.buildRunId.trim() : null;
    if (!projectId) return res.status(400).json({ error: "A persisted project selection is required." });
    const project = await getProjectForUser(user.id, projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.archivedAt) return res.status(409).json({ error: "Restore the archived project before selecting it." });
    if (conversationId) {
      const conversation = await getConversationForUser(user.id, conversationId);
      if (!conversation || conversation.projectId !== projectId) return res.status(404).json({ error: "Conversation not found in selected project." });
    }
    if (buildRunId) {
      const run = await loadDurableBuildRun(user.id, buildRunId);
      if (!run || run.projectId !== projectId) return res.status(404).json({ error: "Build run not found in selected project." });
      if (!matchesWorkspaceBuildRunTuple({ projectId, conversationId }, run)) {
        return res.status(409).json({ error: "Build Run, project, and conversation must be saved as one matching workspace selection." });
      }
    }
    res.json(await saveWorkspaceSelection(user.id, { projectId, conversationId, buildRunId }));
  });

  app.get("/api/workspace/discovery", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const selection = await getWorkspaceSelection(user.id);
    const archive = req.query.status === "archived" ? "archived" : req.query.status === "all" ? "all" : "active";
    const projects = await listProjects(user.id, archive);
    const snapshots = await Promise.all(projects.map(project => projectReportSnapshot(user.id, project)));
    res.json(createSmartBuildDiscoverySnapshot(snapshots, selection?.projectId));
  });

  app.post("/api/workspace/projects", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "Project name is required." });
    res.status(201).json(await createProject(user.id, name, typeof req.body?.description === "string" ? req.body.description : undefined));
  });

  app.post("/api/workspace/projects/:projectId/archive", async (req, res) => {
    const user = await requireUser(req, res);
    const projectId = numeric(req.params.projectId);
    if (!user || !projectId) return;
    const selection = await getWorkspaceSelection(user.id);
    const project = await archiveProjectForUser(user.id, projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json({ project, selectionCleared: selection?.projectId === projectId });
  });

  app.patch("/api/workspace/projects/:projectId", async (req, res) => {
    const user = await requireUser(req, res);
    const projectId = numeric(req.params.projectId);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!user || !projectId) return;
    if (!name) return res.status(400).json({ error: "Workspace name is required." });
    const project = await getProjectForUser(user.id, projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json(await updateProjectDetails(user.id, projectId, { name, description: project.description || "" }));
  });

  app.post("/api/workspace/projects/:projectId/generate-name", async (req, res) => {
    const user = await requireUser(req, res);
    const projectId = numeric(req.params.projectId);
    const conversationId = numeric(req.body?.conversationId);
    const description = typeof req.body?.request === "string" ? req.body.request.trim().slice(0, 4_000) : "";
    const renameProject = req.body?.renameProject === true;
    const renameConversation = req.body?.renameConversation === true;
    if (!user || !projectId || !conversationId) return;
    if (!description) return res.status(400).json({ error: "A project description is required." });
    if (!renameProject && !renameConversation) return res.status(400).json({ error: "Select a generated workspace name to replace." });
    const project = await getProjectForUser(user.id, projectId);
    const conversation = await getConversationForUser(user.id, conversationId);
    if (!project || !conversation || conversation.projectId !== projectId) return res.status(404).json({ error: "Workspace conversation not found." });
    try {
      const model = req.body?.model === AI_MODEL_IDS.claude ? AI_MODEL_IDS.claude : undefined;
      const name = await generateWorkspaceName(description, model);
      const [updatedProject, updatedConversation] = await Promise.all([
        renameProject ? updateProjectDetails(user.id, projectId, { name, description: project.description || "" }) : Promise.resolve(project),
        renameConversation ? updateConversationTitle(user.id, conversationId, name) : Promise.resolve(conversation),
      ]);
      res.json({ project: updatedProject, conversation: updatedConversation });
    } catch (error) {
      console.error("[WorkspaceName] AI-generated name could not be saved.", error);
      res.status(503).json({ error: "The connected AI could not generate a project name. Check the AI provider and try again." });
    }
  });

  app.get("/api/workspace/projects/:projectId/settings", async (req, res) => {
    const user = await requireUser(req, res);
    const projectId = numeric(req.params.projectId);
    if (!user || !projectId) return;
    const project = await getProjectForUser(user.id, projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    try {
      const events = await listProjectEvents(user.id, projectId, undefined, "build.published");
      let published: { buildRunId: string; publicUrl: string; publishedAt: string; websiteName: string } | null = null;
      for (const event of events.reverse()) {
        let payload: { buildRunId?: unknown; publicUrl?: unknown };
        try {
          payload = JSON.parse(event.payload) as { buildRunId?: unknown; publicUrl?: unknown };
        } catch {
          continue;
        }
        if (typeof payload.buildRunId !== "string" || typeof payload.publicUrl !== "string") continue;
        let publicUrl: URL;
        try {
          publicUrl = new URL(payload.publicUrl);
        } catch {
          continue;
        }
        if (publicUrl.protocol !== "http:" && publicUrl.protocol !== "https:") continue;
        const run = await loadDurableBuildRun(user.id, payload.buildRunId);
        if (!run || run.projectId !== projectId || run.status !== "succeeded" || !run.preview || run.manualChangesPendingVerification) continue;
        if (publicUrl.pathname !== `/published/${publicationToken(run.id)}/` || publicUrl.search || publicUrl.hash) continue;
        published = { buildRunId: run.id, publicUrl: publicUrl.href, publishedAt: event.createdAt.toISOString(), websiteName: run.contract.projectName };
        break;
      }
      res.setHeader("cache-control", "no-store");
      res.json({ published });
    } catch (error) {
      console.error("Project General settings could not be loaded.", error);
      res.status(503).json({ error: "Project settings are temporarily unavailable." });
    }
  });

  app.post("/api/workspace/projects/:projectId/restore", async (req, res) => {
    const user = await requireUser(req, res);
    const projectId = numeric(req.params.projectId);
    if (!user || !projectId) return;
    const project = await restoreArchivedProjectForUser(user.id, projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json({ project });
  });

  app.delete("/api/workspace/projects/:projectId", async (req, res) => {
    const user = await requireUser(req, res);
    const projectId = numeric(req.params.projectId);
    if (!user || !projectId) return;
    try {
      const selection = await getWorkspaceSelection(user.id);
      const durableRuns = await listDurableBuildRuns(user.id, projectId);
      const localRuns = await listLocalBuildRunCandidates(user.id, projectId);
      const runRecords = Array.from(new Map(
        [...durableRuns, ...localRuns].map(run => [run.id, run]),
      ).values());
      const activeSteps = runRecords
        .map(run => activeBuildSteps.get(run.id))
        .filter((step): step is Promise<BuildRun> => step !== undefined);
      await Promise.all(runRecords
        .filter(run => activeBuildSteps.has(run.id))
        .map(run => cancelTimedOutBuild(run.id, undefined, "Workspace deleted by user.")));
      const deleted = await deleteProjectForUser(user.id, projectId);
      if (!deleted) return res.status(404).json({ error: "Project not found." });

      // The path is recomputed from the authenticated tuple rather than trusted
      // from a stored payload. A failed cleanup cannot restore database access to
      // deleted records and does not expose filesystem details to the client.
      await rm(buildWorkspacePath(user.id, projectId), { recursive: true, force: true });
      await Promise.all(runRecords.map(run => rm(localBuildRunStatePath(user.id, run.id), { force: true })));
      const cleanupBuildRuns = async () => {
        await Promise.all(runRecords.map(async run => {
          await forgetBuildRun(run.id);
          await rm(localBuildRunStatePath(user.id, run.id), { force: true });
        }));
        await rm(buildWorkspacePath(user.id, projectId), { recursive: true, force: true });
      };
      if (activeSteps.length) {
        void Promise.allSettled(activeSteps).then(cleanupBuildRuns).catch(error => {
          console.error("[WorkspaceDeletion] Deferred Build Run cleanup failed", publicText(error instanceof Error ? error.message : error));
        });
      } else {
        await cleanupBuildRuns();
      }
      res.json({ deletedProjectId: deleted.projectId, selectionCleared: selection?.projectId === deleted.projectId });
    } catch {
      res.status(409).json({ error: "The selected workspace could not be deleted safely. Please retry." });
    }
  });

  app.get("/api/workspace/projects/:projectId/conversations", async (req, res) => {
    const context = await requireProject(req, res);
    if (context) res.json(await listConversations(context.user.id, context.project.id));
  });

  app.post("/api/workspace/projects/:projectId/conversations", async (req, res) => {
    const context = await requireProject(req, res);
    if (!context) return;
    const title = cleanTitle(typeof req.body?.title === "string" ? req.body.title : "New conversation");
    res.status(201).json(await createConversation(context.user.id, context.project.id, title));
  });

  app.patch("/api/workspace/conversations/:conversationId", async (req, res) => {
    const user = await requireUser(req, res);
    const conversationId = numeric(req.params.conversationId);
    const title = typeof req.body?.title === "string" ? cleanTitle(req.body.title) : "";
    if (!user || !conversationId) return;
    if (!title) return res.status(400).json({ error: "Conversation name is required." });
    const conversation = await getConversationForUser(user.id, conversationId);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    res.json(await updateConversationTitle(user.id, conversationId, title));
  });

  app.post("/api/workspace/conversations/:conversationId/auto-title", async (req, res) => {
    const user = await requireUser(req, res);
    const conversationId = numeric(req.params.conversationId);
    if (!user || !conversationId) return;
    const conversation = await getConversationForUser(user.id, conversationId);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    const history = await getConversationMessages(user.id, conversationId);
    const messageRoles = history.map(message => message.role);
    const isFirstReply = messageRoles.filter(role => role === "user").length === 1 && messageRoles.includes("assistant");
    if (!isFirstReply) {
      return res.json({ conversation, updated: false });
    }
    const project = await getProjectForUser(user.id, conversation.projectId);
    if (!project) return res.status(404).json({ error: "Workspace not found." });
    try {
      let title = conversation.title;
      let updatedConversation;
      if (canAutoTitleConversation(conversation.title, messageRoles)) {
        const firstUserMessage = history.find(message => message.role === "user");
        if (!firstUserMessage) return res.json({ conversation, project, updated: false });
        const generatedTitle = cleanGeneratedConversationTitle(await generateWorkspaceConversationTitle(firstUserMessage.content));
        if (!generatedTitle) return res.json({ conversation, project, updated: false });
        title = generatedTitle;
        updatedConversation = await updateConversationTitleIfUntitled(user.id, conversationId, generatedTitle);
      } else if (!isUntitledProjectName(project.name)) {
        return res.json({ conversation, project, updated: false });
      }
      const latestConversation = updatedConversation || await getConversationForUser(user.id, conversationId);
      if (!latestConversation) return res.status(404).json({ error: "Conversation not found." });
      const updatedProject = isUntitledProjectName(project.name)
        ? await updateProjectNameIfUntitled(user.id, conversation.projectId, title)
        : undefined;
      res.json({
        conversation: latestConversation,
        project: updatedProject || await getProjectForUser(user.id, conversation.projectId),
        updated: Boolean(updatedConversation || updatedProject),
      });
    } catch (error) {
      console.error("[AutoTitle] Could not generate a conversation title.", {
        errorType: error instanceof Error ? error.name : typeof error,
      });
      res.status(503).json({ error: "The conversation title could not be generated." });
    }
  });

  app.get("/api/workspace/conversations/:conversationId/messages", async (req, res) => {
    const user = await requireUser(req, res);
    const conversationId = numeric(req.params.conversationId);
    if (!user || !conversationId) return;
    const conversation = await getConversationForUser(user.id, conversationId);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    res.json(await getConversationMessages(user.id, conversationId));
  });

  app.get("/api/workspace/conversations/:conversationId/uploads", async (req, res) => {
    const user = await requireUser(req, res);
    const conversationId = numeric(req.params.conversationId);
    if (!user || !conversationId) return;
    const conversation = await getConversationForUser(user.id, conversationId);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    res.json(await listUploads(user.id, conversationId));
  });

  app.get("/api/workspace/projects/:projectId/files", async (req, res) => {
    const context = await requireProject(req, res);
    if (!context) return;
    const conversationId = numeric(req.query.conversationId);
    const requestedBuildRunId = typeof req.query.buildRunId === "string" && req.query.buildRunId.trim() ? req.query.buildRunId.trim() : null;
    const restored = requestedBuildRunId ? { run: await loadDurableBuildRun(context.user.id, requestedBuildRunId) } : await restoreWorkspaceSelection(context.user.id);
    const run = restored.run;
    if (requestedBuildRunId && (!run || run.projectId !== context.project.id || (conversationId && run.conversationId !== conversationId))) {
      return res.status(409).json({ code: "BUILD_RUN_TUPLE_MISMATCH", error: "Build Run files do not belong to the selected workspace." });
    }
    if (run && run.projectId === context.project.id && (!conversationId || run.conversationId === conversationId)) {
      return res.json(await listGeneratedFiles(context.user.id, context.project.id, run.conversationId, run.id));
    }
    // Chat responses that contain fenced source files are also valid workspace
    // output. Keep them scoped to the selected project and conversation so the
    // Code panel can display them even before a tracked Build Run exists.
    res.json(conversationId ? await listGeneratedFiles(context.user.id, context.project.id, conversationId, null) : []);
  });

  app.get("/api/workspace/projects/:projectId/report.csv", async (req, res) => {
    const context = await requireProject(req, res);
    if (!context) return;
    const report = await projectReportSnapshot(context.user.id, context.project);
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename=${safeReportFileName(context.project.name)}-report.csv`);
    res.send(`\uFEFF${createProjectReportCsv(report)}`);
  });

  app.get("/api/workspace/projects/:projectId/report.pdf", async (req, res) => {
    const context = await requireProject(req, res);
    if (!context) return;
    const report = await projectReportSnapshot(context.user.id, context.project);
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", `attachment; filename=${safeReportFileName(context.project.name)}-report.pdf`);
    res.send(createProjectReportPdf(report));
  });

  app.patch("/api/workspace/files/:fileId", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (respondBuildDisabled(res, "WORKSPACE_WRITES_DISABLED", "Saved files are read-only. Existing files are preserved.")) return;
    const fileId = numeric(req.params.fileId);
    if (!fileId) return;
    const content = typeof req.body?.content === "string" ? req.body.content : null;
    if (content === null) return res.status(400).json({ error: "File content is required." });
    await updateGeneratedFile(user.id, fileId, content, typeof req.body?.path === "string" ? req.body.path : undefined);
    res.json({ success: true });
  });

  app.get("/api/workspace/conversations/:conversationId/sources", async (req, res) => {
    const user = await requireUser(req, res);
    const conversationId = numeric(req.params.conversationId);
    if (!user || !conversationId) return;
    res.json(await listResearchSources(user.id, conversationId));
  });

  app.post("/api/research/search", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const query = normaliseResearchQuery(req.body?.query);
    if (query.length < 2) return res.status(400).json({ error: "Enter a research query of at least two characters." });
    try {
      const results = await researchWeb(query);
      const projectId = numeric(req.body?.projectId) ?? undefined;
      const conversationId = numeric(req.body?.conversationId) ?? undefined;
      await addResearchSources(user.id, query, results, projectId, conversationId);
      res.json({ results });
    } catch {
      res.status(503).json({ error: "Web research is temporarily unavailable." });
    }
  });

  app.post("/api/attachments/image", express.raw({ type: "*/*", limit: MAX_REFERENCE_UPLOAD_BYTES }), async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    try {
      const stored = await saveReferenceFile(user.id, bytes, req.headers["content-type"], req.query.fileName, referenceUploadScope(req.query), { put: storagePut, create: createUpload, randomId: crypto.randomUUID });
      res.status(201).json(stored);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_REFERENCE_FILE") return res.status(413).json({ error: "Images must be 5 MB or smaller. Other files must be 25 MB or smaller." });
      const message = referenceUploadFailureMessage(error);
      console.error(`[AttachmentUpload] ${message.startsWith("File storage is not configured") ? "Storage configuration is missing." : "Storage operation failed."} (${error instanceof Error ? error.name : "UnknownError"})`);
      res.status(503).json({ error: message });
    }
  });

  app.post("/api/build-runs", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    respondBuildDisabled(res, "BUILD_CREATION_DISABLED", "New project runs are disabled. Existing workspace files and records are preserved.");
  });

  app.post("/api/build-runs/:buildId/resume", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (respondBuildDisabled(res, "BUILD_EXECUTION_DISABLED", "Build execution is disabled. The saved Build Run and its files remain available.")) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    try {
      const progressed = await advanceAndFinalizeBuildRun(run);
      if (isTerminalBuildStatus(progressed.status)) {
        await recordVerifiedBuildMemory(progressed);
        await saveWorkspaceSelection(user.id, { projectId: progressed.projectId, conversationId: progressed.conversationId, buildRunId: progressed.id });
      }
      res.json({ run: publicBuildRun(progressed) });
    } catch (error) {
      res.status(503).json({ error: "BUILD_RESUME_FAILED", message: publicText(error instanceof Error ? error.message : "Build resume failed.") });
    }
  });

  app.post("/api/scheduled/build-run-heartbeat", async (req, res) => {
    try {
      const cronUser = await sdk.authenticateRequest(req);
      if (!cronUser.isCron || !cronUser.taskUid) return res.status(403).json({ error: "cron-only" });
      const scheduledRun = await getDurableBuildRunForHeartbeatTask(cronUser.taskUid);
      const run = scheduledRun ? await loadDurableBuildRun(scheduledRun.userId, scheduledRun.id) : null;
      if (run) await removeBuildHeartbeat(run);
      return res.json({ ok: true, done: true, disabled: true });
    } catch (error) {
      console.error("[BuildHeartbeat] Scheduled advance failed", publicText(error instanceof Error ? error.message : error));
      return res.status(500).json({ error: "BUILD_HEARTBEAT_FAILED", message: publicText(error instanceof Error ? error.message : "Scheduled build advance failed.") });
    }
  });

  app.get("/api/build-runs/:buildId", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    res.json({ run: publicBuildRun(run) });
  });

  app.post("/api/build-runs/:buildId/publish", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (respondBuildDisabled(res, "PUBLISHING_DISABLED", "Publishing is disabled. Existing saved results are preserved.")) return;
    const durableRun = await loadDurableBuildRun(user.id, req.params.buildId);
    const run = durableRun ? (getBuildRun(durableRun.id) || durableRun as unknown as BuildRun) : null;
    if (!run) return res.status(404).json({ error: "Build run not found." });
    if (run.status !== "succeeded" || !run.preview || run.manualChangesPendingVerification) {
      return res.status(409).json({ error: "Only a successfully verified Build Run with a live Preview can be published." });
    }
    try {
      await ensureBuildPreview(run, buildPersistence());
      const token = publicationToken(run.id);
      const publicUrl = `${req.protocol}://${req.get("host")}/published/${token}/`;
      await appendProjectEvent(user.id, run.projectId, "build.published", { buildRunId: run.id, publicUrl }, run.conversationId);
      res.json({ buildRunId: run.id, publicUrl, token });
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : "The verified Preview could not be published." });
    }
  });

  app.post("/published/:token/api/contact", async (req, res) => {
    const buildRunId = buildRunIdFromPublicationToken(req.params.token);
    if (!buildRunId) return res.status(404).json({ error: "Published site not found." });
    const now = Date.now();
    const limiterId = hashAnalyticsId(ENV.cookieSecret || "smartbuild-contact-development-secret", `${buildRunId}:${req.ip || req.socket.remoteAddress || "unknown"}`);
    const limiter = publicContactRateLimits.get(limiterId);
    if (limiter && now - limiter.windowStart < 10 * 60_000 && limiter.count >= 10) {
      return res.status(429).json({ error: "Too many contact submissions. Please try again later." });
    }
    if (!limiter || now - limiter.windowStart >= 10 * 60_000) publicContactRateLimits.set(limiterId, { windowStart: now, count: 1 });
    else limiter.count += 1;
    if (publicContactRateLimits.size > 5000) {
      publicContactRateLimits.forEach((value, key) => {
        if (now - value.windowStart >= 10 * 60_000) publicContactRateLimits.delete(key);
      });
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Buffer.byteLength(JSON.stringify(req.body), "utf8") > 12 * 1024) {
      return res.status(400).json({ error: "Invalid contact form submission." });
    }
    try {
      const run = await loadPublishedBuildRun(buildRunId);
      if (!run || run.status !== "succeeded" || !run.preview || run.manualChangesPendingVerification) return res.status(404).json({ error: "Published site is unavailable." });
      await ensureBuildPreview(run, buildPersistence());
      if (!run.backend) return res.status(503).json({ error: "This published website has no active contact form service." });
      const backendResponse = await fetch(new URL("/api/contact", run.backend.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: req.body.name, email: req.body.email, message: req.body.message }),
        signal: AbortSignal.timeout(10_000),
      });
      const submission = await backendResponse.json().catch(() => null) as { ok?: unknown; submissionId?: unknown } | null;
      if (!backendResponse.ok || submission?.ok !== true || (typeof submission.submissionId !== "number" && typeof submission.submissionId !== "string")) {
        return res.status(backendResponse.status === 422 ? 400 : 503).json({ error: "The contact form submission could not be saved." });
      }
      res.status(201).json({ ok: true, submissionId: submission.submissionId });
    } catch (error) {
      console.error("Published website contact submission failed.", error);
      res.status(503).json({ error: "The contact form service is temporarily unavailable." });
    }
  });

  app.get("/api/projects/:projectId/secrets", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const projectId = Number(req.params.projectId);
    if (!Number.isSafeInteger(projectId) || projectId < 1) return res.status(400).json({ error: "Choose a valid project." });
    if (!await getProjectForUser(user.id, projectId)) return res.status(404).json({ error: "Project not found." });
    try {
      const secrets = await listProjectSecrets(user.id, projectId);
      res.setHeader("cache-control", "no-store");
      res.json({ secrets: secrets.filter(secret => secret.name !== LEGACY_GMAIL_NOTIFICATION_SECRET_NAME).map(({ id, name, provider, createdAt, updatedAt }) => ({ id, name, provider, createdAt, updatedAt })) });
    } catch {
      console.error("Project API key metadata could not be loaded.");
      res.status(503).json({ error: "Saved API key metadata is temporarily unavailable." });
    }
  });

  app.post("/api/projects/:projectId/secrets", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const projectId = Number(req.params.projectId);
    if (!Number.isSafeInteger(projectId) || projectId < 1) return res.status(400).json({ error: "Choose a valid project." });
    if (!await getProjectForUser(user.id, projectId)) return res.status(404).json({ error: "Project not found." });
    if (!validProjectSecretInput(req.body) || req.body.name === LEGACY_GMAIL_NOTIFICATION_SECRET_NAME) return res.status(400).json({ error: "Enter a valid key name, service name, and API key." });
    try {
      const encrypted = encryptProjectSecret(req.body.value);
      const secret = await createProjectSecret(user.id, projectId, {
        name: req.body.name,
        provider: req.body.provider.trim(),
        ...encrypted,
      });
      if (!secret) throw new Error("PROJECT_SECRET_SAVE_FAILED");
      res.status(201).json({ secret: { id: secret.id, name: secret.name, provider: secret.provider, createdAt: secret.createdAt, updatedAt: secret.updatedAt } });
    } catch (error) {
      if (error instanceof Error && /PROJECT_SECRET_NAME_EXISTS|Duplicate entry|ER_DUP_ENTRY/.test(error.message)) {
        return res.status(409).json({ error: "That key name already exists in this project." });
      }
      if (error instanceof Error && error.message === "PROJECT_SECRET_ENCRYPTION_UNAVAILABLE") {
        return res.status(503).json({ error: "Secure key storage is not configured on this server." });
      }
      console.error("A project API key could not be saved.");
      res.status(500).json({ error: "The API key could not be saved securely." });
    }
  });

  app.put("/api/projects/:projectId/secrets/:secretId", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const projectId = Number(req.params.projectId);
    const secretId = Number(req.params.secretId);
    if (!Number.isSafeInteger(projectId) || projectId < 1 || !Number.isSafeInteger(secretId) || secretId < 1) {
      return res.status(400).json({ error: "Choose a valid project and API key." });
    }
    if (!await getProjectForUser(user.id, projectId)) return res.status(404).json({ error: "Project not found." });
    if (!validProjectSecretInput(req.body) || req.body.name === LEGACY_GMAIL_NOTIFICATION_SECRET_NAME) return res.status(400).json({ error: "Enter a valid key name, service name, and API key." });
    try {
      const encrypted = encryptProjectSecret(req.body.value);
      const secret = await updateProjectSecret(user.id, projectId, secretId, {
        name: req.body.name,
        provider: req.body.provider.trim(),
        ...encrypted,
      });
      if (!secret) return res.status(404).json({ error: "Saved API key not found." });
      res.setHeader("cache-control", "no-store");
      res.json({ secret: { id: secret.id, name: secret.name, provider: secret.provider, createdAt: secret.createdAt, updatedAt: secret.updatedAt } });
    } catch (error) {
      if (error instanceof Error && /PROJECT_SECRET_NAME_EXISTS|Duplicate entry|ER_DUP_ENTRY/.test(error.message)) {
        return res.status(409).json({ error: "That key name already exists in this project." });
      }
      if (error instanceof Error && error.message === "PROJECT_SECRET_ENCRYPTION_UNAVAILABLE") {
        return res.status(503).json({ error: "Secure key storage is not configured on this server." });
      }
      console.error("A project API key could not be updated.");
      res.status(500).json({ error: "The API key could not be updated securely." });
    }
  });

  app.delete("/api/projects/:projectId/secrets/:secretId", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const projectId = Number(req.params.projectId);
    const secretId = Number(req.params.secretId);
    if (!Number.isSafeInteger(projectId) || projectId < 1 || !Number.isSafeInteger(secretId) || secretId < 1) {
      return res.status(400).json({ error: "Choose a valid project and API key." });
    }
    if (!await getProjectForUser(user.id, projectId)) return res.status(404).json({ error: "Project not found." });
    try {
      if (!await deleteProjectSecret(user.id, projectId, secretId)) return res.status(404).json({ error: "Saved API key not found." });
      res.status(204).end();
    } catch {
      console.error("A project API key could not be deleted.");
      res.status(500).json({ error: "The API key could not be deleted." });
    }
  });

  app.get("/api/build-runs/:buildId/database", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    if (run.status !== "succeeded") return res.status(409).json({ error: "The database is available after the Build Run passes verification." });
    try {
      await ensureBuildPreview(run, buildPersistence());
      res.setHeader("cache-control", "no-store");
      res.json({ buildRunId: run.id, ...(await inspectBuildRunDatabase(run)) });
    } catch (error) {
      console.error("Project database tables could not be read.", error);
      res.status(503).json({ error: "The project database is temporarily unavailable. Try refreshing." });
    }
  });

  app.get("/api/build-runs/:buildId/database/tables/:tableName", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    if (run.status !== "succeeded") return res.status(409).json({ error: "The database is available after the Build Run passes verification." });
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const pageSize = req.query.pageSize === undefined ? 50 : Number(req.query.pageSize);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return res.status(400).json({ error: "Choose a valid database page and page size." });
    }
    try {
      await ensureBuildPreview(run, buildPersistence());
      res.setHeader("cache-control", "no-store");
      res.json({ buildRunId: run.id, ...(await inspectBuildRunDatabase(run, req.params.tableName, page, pageSize)) });
    } catch (error) {
      if (error instanceof Error && error.message === "PROJECT_DATABASE_TABLE_UNAVAILABLE") {
        return res.status(404).json({ error: "Database table not found." });
      }
      console.error("Project database table rows could not be read.", error);
      res.status(503).json({ error: "The project database table is temporarily unavailable. Try refreshing." });
    }
  });

  app.get("/api/build-runs/:buildId/analytics", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const run = await loadDurableBuildRun(user.id, req.params.buildId);
      if (!run) return res.status(404).json({ error: "Build run not found." });
      if (run.status !== "succeeded") return res.status(409).json({ error: "Only a verified published Build Run has analytics." });
      const range = parseAnalyticsDateRange(req.query.from, req.query.to);
      if (!range) return res.status(400).json({ error: "Choose a valid date range within the last ten years." });
      const events = await listProjectEvents(user.id, run.projectId, run.conversationId);
      const publication = events.find(event => {
        if (event.eventType !== "build.published") return false;
        try {
          const payload = JSON.parse(event.payload) as { buildRunId?: string };
          return payload.buildRunId === run.id;
        } catch {
          return false;
        }
      });
      if (!publication) {
        res.setHeader("cache-control", "no-store");
        return res.json({
          buildRunId: run.id,
          published: false,
          publicUrl: null,
          comparison: null,
          analytics: aggregatePublishedAnalytics({ events: [], buildRunId: run.id, start: range.start, end: range.end }),
        });
      }
      let publicUrl: string | null = null;
      try {
        const payload = JSON.parse(publication.payload) as { publicUrl?: string };
        publicUrl = typeof payload.publicUrl === "string" ? payload.publicUrl : null;
      } catch {
        publicUrl = null;
      }
      const pathFilter = typeof req.query.path === "string" && req.query.path.startsWith("/") ? req.query.path.slice(0, 512) : undefined;
      const referrerFilter = typeof req.query.referrer === "string" ? req.query.referrer.slice(0, 253) : undefined;
      const comparisonDuration = range.end.getTime() - range.start.getTime();
      const comparisonEnd = range.start;
      const comparisonStart = new Date(comparisonEnd.getTime() - comparisonDuration);
      const comparison = aggregatePublishedAnalytics({
        events,
        buildRunId: run.id,
        start: comparisonStart,
        end: comparisonEnd,
        path: pathFilter,
        referrer: referrerFilter,
      });
      res.setHeader("cache-control", "no-store");
      res.json({
        buildRunId: run.id,
        published: true,
        publicUrl,
        comparison: {
          pageViews: comparison.pageViews,
          visits: comparison.visits,
          visitors: comparison.visitors,
        },
        analytics: aggregatePublishedAnalytics({
          events,
          buildRunId: run.id,
          start: range.start,
          end: range.end,
          path: pathFilter,
          referrer: referrerFilter,
        }),
      });
    } catch (error) {
      console.error("Published website analytics query failed.", error);
      res.status(503).json({ error: "Website analytics are temporarily unavailable. Try refreshing." });
    }
  });

  app.post("/api/public-analytics/:token/events", async (req, res) => {
    const buildRunId = buildRunIdFromPublicationToken(req.params.token);
    if (!buildRunId) return res.status(404).json({ error: "Published site not found." });
    try {
      const run = await loadPublishedBuildRun(buildRunId);
      if (!run || run.status !== "succeeded" || !run.preview || run.manualChangesPendingVerification) return res.status(404).json({ error: "Published site is unavailable." });
      const parsed = parsePublishedAnalyticsEvent(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid analytics event." });
      const now = Date.now();
      const limiterId = hashAnalyticsId(ENV.cookieSecret || "smartbuild-analytics-development-secret", `${run.id}:${req.ip || req.socket.remoteAddress || "unknown"}`);
      const limiter = publicAnalyticsRateLimits.get(limiterId);
      if (limiter && now - limiter.windowStart < 60_000 && limiter.count >= 120) return res.status(429).json({ error: "Analytics event limit reached." });
      if (!limiter || now - limiter.windowStart >= 60_000) publicAnalyticsRateLimits.set(limiterId, { windowStart: now, count: 1 });
      else limiter.count += 1;
      if (publicAnalyticsRateLimits.size > 5000) {
        publicAnalyticsRateLimits.forEach((value, key) => {
          if (now - value.windowStart >= 60_000) publicAnalyticsRateLimits.delete(key);
        });
      }
      const event = parsed.data;
      const payload = {
        buildRunId: run.id,
        visitorId: hashAnalyticsId(ENV.cookieSecret || "smartbuild-analytics-development-secret", event.visitorId),
        sessionId: hashAnalyticsId(ENV.cookieSecret || "smartbuild-analytics-development-secret", event.sessionId),
        path: event.path,
        ...(event.type === "pageview" ? { referrerHost: event.referrerHost || "(direct)" } : {}),
        ...(event.type === "pagehide" ? { durationSeconds: event.durationSeconds || 0 } : {}),
      };
      await appendProjectEvent(run.userId, run.projectId, `analytics.${event.type}`, payload, run.conversationId);
      res.status(202).json({ accepted: true });
    } catch (error) {
      console.error("Published website analytics event could not be stored.", error);
      res.status(503).json({ error: "Analytics event could not be saved. The visit was not counted." });
    }
  });

  app.get("/api/build-runs/:buildId/review", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    const review = await getBuildRunReviewForUser(user.id, run.id);
    res.json({
      buildRunId: run.id,
      projectId: run.projectId,
      conversationId: run.conversationId,
      review: review ? {
        status: review.status,
        note: review.note,
        reviewedAt: review.reviewedAt,
        updatedAt: review.updatedAt,
      } : null,
    });
  });

  app.put("/api/build-runs/:buildId/review", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    const status = typeof req.body?.status === "string" ? req.body.status : "";
    if (status !== "unreviewed" && status !== "approved" && status !== "changes_requested") {
      return res.status(400).json({ error: "A valid review status is required." });
    }
    const note = typeof req.body?.note === "string" ? req.body.note : null;
    if (note && note.length > 1000) return res.status(400).json({ error: "Review note is too long." });
    const review = await saveBuildRunReviewForUser({
      userId: user.id,
      projectId: run.projectId,
      conversationId: run.conversationId,
      buildRunId: run.id,
      status,
      note,
    });
    if (!review) return res.status(503).json({ error: "Build Run review is temporarily unavailable." });
    res.json({
      buildRunId: run.id,
      projectId: run.projectId,
      conversationId: run.conversationId,
      review: { status: review.status, note: review.note, reviewedAt: review.reviewedAt, updatedAt: review.updatedAt },
    });
  });

  app.get("/api/build-runs/:buildId/evaluators", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    const evaluation = publicSyntheticEvaluation(run.syntheticEvaluation);
    if (!evaluation) return res.status(404).json({ error: "Synthetic evaluation evidence is unavailable for this build run." });
    res.json({ buildRunId: run.id, evaluation });
  });

  app.get("/api/build-runs/:buildId/agents",     createAgentsEvidenceHandler({
      requireUser: (req, res) => requireUser(req, res),
      loadRun: async (userId, buildId) => {
        const run = await loadDurableBuildRun(userId, buildId);
        return run ? { id: run.id, projectId: run.projectId, conversationId: run.conversationId, userId: run.userId, workspaceRoot: run.workspaceRoot } : null;
      },
      readEvidence: async run => {
        const artifact = await readBuildWorkspaceFile(run.id, "evidence/agent-plan.json", buildPersistence());
        const agentPlan = JSON.parse(artifact.content);
        const traceFile = typeof agentPlan.traceFile === "string" && /^[a-zA-Z0-9_-]+\.jsonl$/.test(agentPlan.traceFile) ? agentPlan.traceFile : null;
        const tracePath = traceFile ? path.resolve(run.workspaceRoot, "evidence", "agent-traces", traceFile) : null;
        const traceRoot = path.resolve(run.workspaceRoot, "evidence", "agent-traces");
        const traceContent = tracePath && (tracePath === traceRoot || tracePath.startsWith(`${traceRoot}${path.sep}`)) ? await readFile(tracePath, "utf8").catch(() => null) : null;
        const productionTasks = await durableProductionAgentQueueHooks.list({
          userId: run.userId,
          projectId: run.projectId,
          conversationId: run.conversationId,
          buildRunId: run.id,
        });
        return { plan: agentPlan, traceContent, productionTasks };
      },
    }));

  app.get("/api/build-runs/:buildId/bugs", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    const evaluation = publicSyntheticEvaluation(run.syntheticEvaluation);
    res.json({ buildRunId: run.id, bugs: evaluation?.bugs || [], repairTasks: evaluation?.repair_tasks || [], checkpointAllowed: evaluation?.checkpoint_allowed ?? null });
  });

  app.get("/api/bugs/:bugId", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const selection = await getWorkspaceSelection(user.id);
    const projectId = numeric(req.query.projectId) ?? selection?.projectId ?? null;
    if (!projectId) return res.status(400).json({ error: "Select a project before reading a bug report." });
    const project = await getProjectForUser(user.id, projectId);
    if (!project) return res.status(404).json({ error: "Project not found." });
    const records = await listDurableBuildRuns(user.id, projectId);
    for (const record of records) {
      const run = await loadDurableBuildRun(user.id, record.id);
      const evaluation = run ? publicSyntheticEvaluation(run.syntheticEvaluation) : undefined;
      const bug = evaluation?.bugs.find(item => item.bug_id === req.params.bugId);
      if (bug) return res.json({ buildRunId: record.id, bug, repairTask: evaluation?.repair_tasks.find(item => item.bug_id === bug.bug_id) || null });
    }
    res.status(404).json({ error: "Bug report not found." });
  });

  app.get("/api/build-runs/:buildId/evidence", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    const evaluation = publicSyntheticEvaluation(run.syntheticEvaluation);
    res.json({ buildRunId: run.id, evidence: run.evidence.map(entry => ({ ...entry, path: publicEvidencePath(entry.path), summary: publicText(entry.summary) })), evaluatorEvidence: evaluation ? { outputPath: evaluation.output_path, runs: evaluation.runs.map(item => ({ evaluatorInstance: item.evaluator_instance, evidencePaths: item.evidence_paths, screenshots: item.screenshot_paths, tracePath: item.trace_path })) } : null });
  });

  app.get("/api/build-runs/:buildId/files", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    try {
      await restoreBuildWorkspace(run, buildPersistence());
      res.json({ files: listBuildWorkspaceFiles(run.id) });
    }
    catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : "Build workspace unavailable." }); }
  });

  app.get("/api/build-runs/:buildId/file", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    const filePath = typeof req.query.path === "string" ? req.query.path : "";
    if (!run) return res.status(404).json({ error: "Build run not found." });
    try { res.json(await readBuildWorkspaceFile(run.id, filePath, buildPersistence())); }
    catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : "Build file unavailable." }); }
  });

  app.put("/api/build-runs/:buildId/file", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (respondBuildDisabled(res, "WORKSPACE_WRITES_DISABLED", "Saved files are read-only. Existing files are preserved.")) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    if (typeof req.body?.path !== "string" || typeof req.body?.content !== "string") {
      return res.status(400).json({ error: "A file path and text content are required." });
    }
    try {
      const persistence = buildPersistence();
      await restoreBuildWorkspace(run, persistence);
      const result = await saveBuildRunWorkspaceFile(run, req.body.path, req.body.content, persistence, req.body.createOnly === true);
      res.json({ ...result, run: publicBuildRun(run) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "BUILD_FILE_SAVE_FAILED";
      const status = ["BUILD_FILE_PATH_INVALID", "BUILD_FILE_TOO_LARGE", "BUILD_FILE_CONTENT_INVALID", "BUILD_FILE_JSON_INVALID"].includes(code) ? 400
        : ["BUILD_FILE_PROTECTED", "BUILD_FILE_ALREADY_EXISTS", "BUILD_RUN_NOT_EDITABLE"].includes(code) ? 409
          : 500;
      if (status === 500) console.error("Build Run file could not be saved.", error);
      res.status(status).json({ error: code });
    }
  });

  app.delete("/api/build-runs/:buildId/file", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (respondBuildDisabled(res, "WORKSPACE_WRITES_DISABLED", "Saved files are read-only. Existing files are preserved.")) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    const filePath = typeof req.body?.path === "string" ? req.body.path : "";
    if (!filePath) return res.status(400).json({ error: "A file path is required." });
    try {
      const persistence = buildPersistence();
      await restoreBuildWorkspace(run, persistence);
      const result = await deleteBuildRunWorkspaceFile(run, filePath, persistence);
      res.json({ ...result, run: publicBuildRun(run) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "BUILD_FILE_DELETE_FAILED";
      const status = code === "BUILD_FILE_PATH_INVALID" ? 400
        : code === "BUILD_FILE_NOT_FOUND" ? 404
          : ["BUILD_FILE_PROTECTED", "BUILD_RUN_NOT_EDITABLE"].includes(code) ? 409
            : 500;
      if (status === 500) console.error("Build Run file could not be deleted.", error);
      res.status(status).json({ error: code });
    }
  });

  app.post("/api/build-runs/:buildId/cancel", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).json({ error: "Build run not found." });
    await cancelTimedOutBuild(run.id, buildPersistence());
    if (isTerminalBuildStatus(run.status)) await removeBuildHeartbeat(run);
    res.json({ run: publicBuildRun(run) });
  });

  app.use("/published/:token", async (req, res, next) => {
    const buildRunId = buildRunIdFromPublicationToken(req.params.token);
    if (!buildRunId) return res.status(404).send("Published site not found.");
    const run = await loadPublishedBuildRun(buildRunId);
    if (!run || run.status !== "succeeded" || !run.preview || run.manualChangesPendingVerification) return res.status(404).send("Published site is unavailable.");
    try {
      await ensureBuildPreview(run, buildPersistence());
      const preview = await readBuildPreview(run.id, req.path.replace(/^\/+/, ""));
      res.setHeader("content-type", preview.contentType);
      res.setHeader("cache-control", "no-store");
      const isPublishedDocument = req.method === "GET" && preview.contentType.toLowerCase().includes("text/html");
      if (isPublishedDocument) {
        const html = preview.body.toString("utf8");
        res.send(injectPublishedAnalytics(html, req.params.token));
      } else {
        res.send(preview.body);
      }
    } catch (error) {
      res.status(404).send(error instanceof Error ? error.message : "Published site unavailable.");
    }
  });

  app.use("/api/build-runs/:buildId/preview", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const run = await loadDurableBuildRun(user.id, req.params.buildId);
    if (!run) return res.status(404).send("Build run not found.");
    try {
      await ensureBuildPreview(run, buildPersistence());
      const preview = await readBuildPreview(run.id, req.path.replace(/^\/+/, ""));
      res.setHeader("content-type", preview.contentType);
      res.setHeader("cache-control", "no-store");
      res.send(preview.body);
    } catch (error) {
      res.status(404).send(error instanceof Error ? error.message : "Preview unavailable.");
    }
  });

  registerLocalRoutes(app, {
    requireUser,
    getConversationForUser,
    getProjectForUser,
    appendProjectEvent,
  });

  /* legacy local route block removed: registered through localRoutes.ts */
  /*
  app.get("/api/local/folder", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    res.json(localFolders.get(user.id) || unboundFolder());
  });

  app.post("/api/local/folder", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const root = typeof req.body?.root === "string" ? req.body.root.trim() : "";
      const previous = localFolders.get(user.id);
      if (!root) {
        const binding = unboundFolder();
        const event = recordEvent(user.id, LOCAL_WORKSPACE_SCOPE.projectId, LOCAL_WORKSPACE_SCOPE.conversationId, "local.unbound", "Unbound the user-scoped local folder.");
        if (!event) return res.status(409).json({ error: "No local folder is currently bound." });
        localFolders.set(user.id, binding);
        return res.json(binding);
      }
      const binding = bindFolder(root);
      localFolders.set(user.id, binding);
      const type = previous?.state === "Bound" ? "local.rebound" : "local.bound";
      recordEvent(user.id, LOCAL_WORKSPACE_SCOPE.projectId, LOCAL_WORKSPACE_SCOPE.conversationId, type, binding.state === "Bound" ? `${type === "local.rebound" ? "Rebound" : "Bound"} local folder ${binding.folderName}.` : "Local folder unbound.");
      res.json(binding);
    } catch (error) {
      if (error instanceof Error && error.message === "ABSOLUTE_FOLDER_REQUIRED") return res.status(400).json({ error: "Choose an absolute folder path from Manus Desktop." });
      res.status(400).json({ error: "The local folder could not be bound." });
    }
  });

  app.post("/api/local/checkpoint", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const projectId = numeric(req.body?.projectId);
    const conversationId = numeric(req.body?.conversationId);
    const evidence = typeof req.body?.evidence === "string" ? req.body.evidence.trim() : "";
    if (!projectId || !conversationId || !evidence) return res.status(400).json({ error: "Project, conversation, and checkpoint evidence are required." });
    const conversation = await getConversationForUser(user.id, conversationId);
    const project = await getProjectForUser(user.id, projectId);
    if (!conversation || conversation.projectId !== projectId || !project) return res.status(404).json({ error: "The selected workspace is unavailable." });
    const event = recordEvent(user.id, projectId, conversationId, "checkpoint.saved", evidence.slice(0, 500));
    if (!event) return res.status(409).json({ error: "Create a verified plan before saving a checkpoint." });
    res.status(201).json(event);
  });

  */

  registerAgentRuntimeRoute(app, {
    requireUser,
  });

  app.post("/api/ai/plan", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (respondBuildDisabled(res, "BUILD_CREATION_DISABLED", "New project plans and runs are disabled. Existing workspace files remain available.")) return;
  });

  app.post("/api/local/preview", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const projectId = numeric(req.body?.projectId);
    const conversationId = numeric(req.body?.conversationId);
    if (!projectId || !conversationId) return res.status(400).json({ error: "Project and conversation are required." });
    const conversation = await getConversationForUser(user.id, conversationId);
    const project = await getProjectForUser(user.id, projectId);
    if (!conversation || conversation.projectId !== projectId || !project) return res.status(404).json({ error: "The selected workspace is unavailable." });
    const host = req.get("host");
    if (!host) {
      const evidence = "Preview blocked: the request host was unavailable, so no preview URL could be created.";
      const graph = markPreviewBlocked(user.id, projectId, conversationId, evidence);
      if (!graph) return res.status(409).json({ error: "Generate verified files before running Preview." });
      await appendProjectEvent(user.id, projectId, "preview.blocked", { reason: evidence }, conversationId);
      return res.status(409).json({ status: "blocked", error: evidence, graph });
    }
    const previewUrl = `${req.protocol}://${host}/`;
    const evidence = `Preview available at ${previewUrl}`;
    const graph = markPreview(user.id, projectId, conversationId, evidence);
    if (!graph) return res.status(409).json({ error: "Generate verified files before running Preview." });
    await appendProjectEvent(user.id, projectId, "preview.verified", { previewUrl }, conversationId);
    res.json({ previewUrl, graph });
  });

  app.post("/api/local/qa", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const projectId = numeric(req.body?.projectId);
    const conversationId = numeric(req.body?.conversationId);
    if (!projectId || !conversationId) return res.status(400).json({ error: "Project and conversation are required." });
    const conversation = await getConversationForUser(user.id, conversationId);
    const project = await getProjectForUser(user.id, projectId);
    if (!conversation || conversation.projectId !== projectId || !project) return res.status(404).json({ error: "The selected workspace is unavailable." });
    try {
      const { stdout, stderr } = await execFileAsync("pnpm", ["check"], { cwd: process.cwd(), timeout: 120000, maxBuffer: 1024 * 1024 });
      const evidence = `pnpm check passed. ${[stdout, stderr].filter(Boolean).join(" ").trim().slice(0, 500)}`;
      const graph = markTested(user.id, projectId, conversationId, evidence);
      if (!graph) return res.status(409).json({ error: "Run Preview before QA." });
      await appendProjectEvent(user.id, projectId, "qa.verified", { command: "pnpm check", status: "passed" }, conversationId);
      res.json({ status: "passed", evidence, graph });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "pnpm check failed";
      res.status(422).json({ status: "failed", error: detail.slice(0, 500) });
    }
  });

  app.post("/api/workspace/conversations/:conversationId/local-reply", async (req, res) => {
    const user = await requireUser(req, res);
    const conversationId = numeric(req.params.conversationId);
    const projectId = numeric(req.body?.projectId);
    const userContent = typeof req.body?.userContent === "string" ? req.body.userContent.trim() : "";
    const assistantContent = typeof req.body?.assistantContent === "string" ? req.body.assistantContent.trim() : "";
    if (!user || !conversationId) return;
    if (!projectId || !userContent || userContent.length > 20_000 || !assistantContent || assistantContent.length > 40_000) {
      return res.status(400).json({ error: "A valid conversation, user message, and local reply are required." });
    }
    const conversation = await getConversationForUser(user.id, conversationId);
    const project = await getProjectForUser(user.id, projectId);
    if (!conversation || conversation.projectId !== projectId || !project) {
      return res.status(404).json({ error: "The selected workspace is unavailable." });
    }
    const history = await getConversationMessages(user.id, conversationId);
    const latestMessage = history.at(-1);
    if (latestMessage?.role !== "user" || latestMessage.content !== userContent) {
      return res.status(409).json({ error: "The conversation changed before the local reply could be saved." });
    }
    await addMessage(user.id, conversationId, "assistant", assistantContent);
    res.status(201).json({ saved: true });
  });

  app.post("/api/ai/stream", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (req.body?.mode === "generate") {
      return res.status(410).json({ code: "BUILD_EXECUTION_DISABLED", error: "Project implementation is disabled. You can still ask questions and access existing workspace files." });
    }
    if (historyContainsLikelyApiSecret(req.body?.messages)) {
      return res.status(400).json({ code: "API_KEY_MUST_USE_SECRETS", error: "An API key-like value was not accepted or saved in Chat. Use the secure project Settings → Secrets form instead." });
    }
    const conversationId = numeric(req.body?.conversationId);
    const projectId = numeric(req.body?.projectId);
    const supplied = preserveMarkdownHistory(req.body?.messages);
    const model = req.body?.model === AI_MODEL_IDS.claude || req.body?.model === AI_MODEL_IDS.smartbuild ? req.body.model : undefined;
    if (req.body?.model !== undefined && !model) return res.status(400).json({ code: "CHAT_MODEL_INVALID", error: "The selected chat model is not supported." });
    if (model === AI_MODEL_IDS.claude && !isAnthropicProviderConfigured()) {
      return res.status(503).json({ code: "ANTHROPIC_API_KEY_NOT_CONFIGURED", error: "Claude Sonnet 5.5 is selected, but ANTHROPIC_API_KEY is not configured on the server." });
    }
    if (!conversationId || !projectId || !supplied.length) return res.status(400).json({ error: "Project, conversation, and messages are required." });
    const conversation = await getConversationForUser(user.id, conversationId);
    const project = await getProjectForUser(user.id, projectId);
    if (!conversation || conversation.projectId !== projectId || !project) return res.status(404).json({ error: "The selected workspace is unavailable." });
    const newestUserMessage = [...supplied].reverse().find(message => message.role === "user");
    let visionImages: Awaited<ReturnType<typeof loadVisionImages>> = [];
    let verifiedAttachments: Awaited<ReturnType<typeof loadVisionAttachments>>["attachments"] = [];
    if (req.body?.attachments !== undefined) {
      if (!newestUserMessage) return res.status(400).json({ error: "Send a user message with the attached image." });
      try {
        const verified = await loadVisionAttachments(user.id, conversationId, req.body.attachments, await listUploads(user.id, conversationId));
        visionImages = verified.images;
        verifiedAttachments = verified.attachments;
      } catch (error) {
        const detail = error instanceof Error ? error.message : "ATTACHED_IMAGE_UNAVAILABLE";
        if (detail === "TOO_MANY_ATTACHMENTS") return res.status(400).json({ error: "Attach up to 12 files to one message." });
        if (["INVALID_IMAGE_ATTACHMENTS", "ATTACHED_IMAGE_NOT_OWNED", "ATTACHED_IMAGE_INVALID", "ATTACHED_IMAGE_TOO_LARGE", "ATTACHED_IMAGE_FORMAT_UNSUPPORTED"].includes(detail)) {
          if (detail === "ATTACHED_IMAGE_TOO_LARGE") return res.status(413).json({ error: "Images may be up to 5 MB each and 15 MB combined per message. Remove some images and try again." });
          const error = detail === "ATTACHED_IMAGE_FORMAT_UNSUPPORTED"
            ? "Use a PNG, JPEG, GIF, or WebP image so the selected model can view it."
            : "The attached image could not be verified. Reattach the image and try again.";
          return res.status(detail === "ATTACHED_IMAGE_FORMAT_UNSUPPORTED" ? 415 : 400).json({ error });
        }
        console.error(`[VisionAttachment] Failed to load an authorized image (${detail}).`);
        return res.status(503).json({ error: "The attached image could not be loaded. Reattach it and try again." });
      }
    }
    if (newestUserMessage && isWorkspaceDeletionRequest(newestUserMessage.content)) {
      await addMessage(user.id, conversationId, "user", newestUserMessage.content);
      const selected = await restoreWorkspaceSelection(user.id);
      const run = selected.run && selected.run.projectId === projectId && selected.run.conversationId === conversationId ? selected.run : null;
      try {
        const result = await executeWorkspaceDeletion({
          userId: user.id,
          projectId,
          conversationId,
          run,
          saveSelection: saveWorkspaceSelection,
        });
        const summary = deletionAssistantSummary(result);
        await addMessage(user.id, conversationId, "assistant", summary);
        res.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
        res.flushHeaders();
        res.write(`data: ${JSON.stringify({ token: summary })}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      } catch (error) {
        const detail = publicText(error instanceof Error ? error.message : "Workspace deletion failed.");
        const message = `SmartBuild could not safely clear the generated workspace: ${detail || "unknown deletion error"}`;
        await addMessage(user.id, conversationId, "assistant", message);
        return res.status(409).json({ error: "WORKSPACE_DELETION_FAILED", message });
      }
    }
    if (newestUserMessage) await addMessage(user.id, conversationId, "user", encodeMessageAttachments(newestUserMessage.content, verifiedAttachments));
    const capabilityContext = workspaceCapabilityInstructions(detectWorkspaceCapabilities());
    const modelMessages = attachImagesToLatestUserMessage(supplied, visionImages);
    res.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
    res.flushHeaders();
    let closed = false;
    let responseText = "";
    let assistantReplyPersisted = false;
    res.on("close", () => { closed = true; });
    try {
      await invokeWorkspaceLLMStream({
        messages: [
          { role: "system", content: [workspaceAssistantInstructions(), capabilityContext].join("\n\n") },
          ...modelMessages,
        ],
        maxTokens: 4096,
        reasoning: { effort: "low" },
        model,
      }, async token => {
        responseText += token;
        if (!closed && !res.writableEnded) res.write(`data: ${JSON.stringify({ token })}\n\n`);
      });
      if (responseText) {
        await addMessage(user.id, conversationId, "assistant", responseText);
        assistantReplyPersisted = true;
      }
      if (!closed && !res.writableEnded) res.write("data: [DONE]\n\n");
    } catch (error) {
      if (responseText && !assistantReplyPersisted) {
        try {
          await addMessage(user.id, conversationId, "assistant", responseText);
          assistantReplyPersisted = true;
        } catch (persistenceError) {
          console.error("[AIStream] Could not persist the generated assistant text.", {
            errorType: persistenceError instanceof Error ? persistenceError.name : typeof persistenceError,
          });
        }
      }
      const failureMessage = getAiProviderFailureMessage(error);
      const providerStatus = error instanceof Error ? error.message.match(/status (\d{3})/i)?.[1] : undefined;
      console.error("[AIStream] Provider request failed.", {
        errorType: error instanceof Error ? error.name : typeof error,
        providerStatus: providerStatus || "unavailable",
      });
      if (!closed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: failureMessage, retryable: shouldFallbackToBrowser(error) })}\n\n`);
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  const port = await findAvailablePort(Number(process.env.PORT || 3000));
  const localClientEntry = path.resolve(process.cwd(), "client", "index.html");
  if (process.env.NODE_ENV !== "production" || (await readFile(localClientEntry).then(() => true).catch(() => false))) {
    await setupVite(app, server, port);
  } else {
    serveStatic(app);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    const legacyPort = 3002;
    if (process.env.NODE_ENV !== "production" && port !== legacyPort) {
      const legacyServer = createServer(app);
      legacyServer.on("error", error => {
        console.error(`[DevServer] Could not serve the app on legacy localhost:${legacyPort}.`, error);
      });
      legacyServer.listen(legacyPort, () => {
        console.log(`SmartBuild is also available at http://localhost:${legacyPort}/`);
      });
    }
  });
}

startServer().catch(error => console.error(error));
