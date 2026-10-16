import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  addGeneratedFile,
  claimNextDurableBuildRunAgentTask,
  completeDurableBuildRunAgentTask,
  renewDurableBuildRunAgentTaskLease,
  type DurableAgentTaskScope,
} from "./db";
import {
  executeProductionAgent,
  type AgentModelInvoker,
  type ProducedFile,
  type ProductionAgentContext,
  type ProductionAgentOutcome,
  type ProductionAgentTask,
} from "./agentProductionExecutor";
import { invokeAnthropicStructured } from "./llmStream";
import { AI_MODEL_IDS } from "@shared/aiModels";
import { WEBSITE_BUILDER_AGENT_ID } from "./websiteBuilderAgent";
import { runOnePythonProductionAgent, type PythonProductionAgentExecution, type PythonProductionExecutionMetadata } from "./agentOrchestrator";
import { agentExecutionEvidencePath } from "./agentExecutionEvidencePath";

export type ProductionAgentWorkerInput = {
  scope: DurableAgentTaskScope;
  model?: string;
  requirement: string;
  workspaceRoot: string;
  knownFiles: readonly string[];
  tasks: readonly ProductionAgentTask[];
};

export type ProductionAgentWorkerResult =
  | { state: "idle" }
  | { state: "succeeded"; taskId: string; agentId: string; artifactRefs: string[]; evidenceRefs: string[] }
  | { state: "blocked"; taskId: string; agentId: string; reason: string }
  | { state: "failed"; taskId: string; agentId: string; code: string };

type ClaimedTask = { taskId: string; agentId: string };

export type ProductionAgentWorkerDependencies = {
  claim?: (scope: DurableAgentTaskScope, leaseToken: string, leaseDurationMs: number) => Promise<ClaimedTask | undefined>;
  renew?: (scope: DurableAgentTaskScope, taskId: string, leaseToken: string, leaseDurationMs: number) => Promise<boolean>;
  complete?: typeof completeDurableBuildRunAgentTask;
  execute?: (task: ProductionAgentTask, context: ProductionAgentContext) => Promise<ProductionAgentOutcome>;
  executePython?: (input: { buildRunId: string; projectId: number; conversationId: number; request: string; workspaceRoot: string; taskId: string; agentId: string }) => Promise<PythonProductionAgentExecution>;
  persist?: (input: ProductionAgentWorkerInput, files: readonly ProducedFile[]) => Promise<string[]>;
  persistEvidence?: (input: ProductionAgentWorkerInput, task: ProductionAgentTask, outcome: ProductionAgentOutcome) => Promise<string[]>;
};

function languageForFile(pathname: string) {
  const extension = path.extname(pathname).slice(1).toLowerCase();
  return ({ ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", css: "css", html: "html", json: "json", md: "markdown" } as Record<string, string>)[extension] || "text";
}

function safeWorkspacePath(workspaceRoot: string, artifactPath: string) {
  const canonicalRoot = path.resolve(workspaceRoot);
  const absolute = path.resolve(canonicalRoot, artifactPath);
  if (!absolute.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error("AGENT_ARTIFACT_SCOPE_DENIED");
  return absolute;
}

function assertUniqueProducedFilePaths(files: readonly ProducedFile[]) {
  const seenPaths = new Set<string>();
  for (const file of files) {
    if (seenPaths.has(file.path)) throw new Error("AGENT_OUTPUT_PATH_DUPLICATE");
    seenPaths.add(file.path);
  }
}

function isSafePythonSourcePath(artifactPath: string) {
  if (!/^(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*$/.test(artifactPath)) return false;
  const segments = artifactPath.split("/");
  return !segments.some(segment => segment.startsWith(".")) &&
    segments[0] !== "evidence" &&
    segments[0] !== "node_modules" &&
    !segments.some(segment => /^\.env(?:\.|$)/.test(segment));
}

function isPathAllowedForProductionTask(artifactPath: string, scopes: readonly string[]) {
  return scopes.some(scope => {
    if (scope === "project/**") return true;
    if (scope === artifactPath) return true;
    if (!scope.endsWith("/**")) return false;
    const prefix = scope.slice(0, -3);
    return artifactPath.startsWith(prefix) && artifactPath.length > prefix.length;
  });
}

const SOURCE_FILE_EXTENSIONS = new Set([".css", ".html", ".js", ".jsx", ".json", ".mjs", ".py", ".sql", ".ts", ".tsx"]);
const MAX_AGENT_SOURCE_FILE_CHARS = 8_000;
const MAX_AGENT_SOURCE_CHARS = 48_000;
const AGENT_TASK_LEASE_MS = 30 * 60 * 1000;
const AGENT_TASK_LEASE_RENEW_INTERVAL_MS = 30 * 1000;

async function readScopedSourceFiles(input: ProductionAgentWorkerInput, task: ProductionAgentTask): Promise<ProducedFile[]> {
  const paths = input.knownFiles
    .filter(file => isSafePythonSourcePath(file) && isPathAllowedForProductionTask(file, task.allowedReadPathScopes))
    .filter(file => SOURCE_FILE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort((left, right) => {
      const score = (value: string) => /(?:style|theme|app|main|index|page|layout|component|route|controller)/i.test(value) ? 0 : 1;
      return score(left) - score(right) || left.localeCompare(right);
    });
  const sourceFiles: ProducedFile[] = [];
  let totalChars = 0;
  for (const relativePath of paths) {
    if (totalChars >= MAX_AGENT_SOURCE_CHARS) break;
    const content = await readFile(safeWorkspacePath(input.workspaceRoot, relativePath), "utf8");
    const remainingChars = MAX_AGENT_SOURCE_CHARS - totalChars;
    const boundedContent = content.slice(0, Math.min(MAX_AGENT_SOURCE_FILE_CHARS, remainingChars));
    if (!boundedContent.trim()) continue;
    sourceFiles.push({ path: relativePath, content: boundedContent });
    totalChars += boundedContent.length;
  }
  return sourceFiles;
}

const containsSecretLikeValue = (content: string) =>
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----|\b(?:sk|rk|pk|AIza)_[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}/.test(content);

const PYTHON_SOURCE_WRITER_IDS = new Set(["agent_005", "agent_007", "agent_030", "agent_065"]);

export function shouldUseCanonicalPythonWriter(agentId: string, hasExplicitPythonExecutor: boolean) {
  return hasExplicitPythonExecutor || (/^agent_\d{3}$/.test(agentId) && !["agent_005", "agent_030"].includes(agentId));
}

export async function persistProductionAgentFiles(input: ProductionAgentWorkerInput, files: readonly ProducedFile[]) {
  assertUniqueProducedFilePaths(files);
  const artifactRefs: string[] = [];
  for (const file of files) {
    const absolute = safeWorkspacePath(input.workspaceRoot, file.path);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, file.content, "utf8");
    await addGeneratedFile(input.scope.userId, input.scope.projectId, input.scope.conversationId, file.path, languageForFile(file.path), file.content, input.scope.buildRunId);
    artifactRefs.push(file.path);
  }
  return artifactRefs;
}

export async function persistProductionAgentEvidence(input: ProductionAgentWorkerInput, task: ProductionAgentTask, outcome: ProductionAgentOutcome) {
  const artifactPath = agentExecutionEvidencePath(task.taskId);
  const content = JSON.stringify({
    format: "smartbuild-agent-execution-evidence-v1",
    buildRunId: input.scope.buildRunId,
    projectId: input.scope.projectId,
    conversationId: input.scope.conversationId,
    taskId: task.taskId,
    agentId: task.agentId,
    status: outcome.status,
    summary: outcome.summary,
    verification: outcome.verification,
    blockedReason: outcome.blockedReason || null,
    artifactPaths: outcome.changedFiles.map(file => file.path),
    evidenceRefs: outcome.evidenceRefs,
  }, null, 2);
  const absolute = safeWorkspacePath(input.workspaceRoot, artifactPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
  await addGeneratedFile(input.scope.userId, input.scope.projectId, input.scope.conversationId, artifactPath, "json", content, input.scope.buildRunId);
  return [artifactPath];
}

async function readScopedPythonOutputs(
  input: ProductionAgentWorkerInput,
  task: ProductionAgentTask,
  artifactPaths: readonly string[]
): Promise<{ files: ProducedFile[]; sourceFiles: ProducedFile[]; additiveActionCount: number }> {
  if (new Set(artifactPaths).size !== artifactPaths.length) throw new Error("AGENT_OUTPUT_PATH_DUPLICATE");
  const files: ProducedFile[] = [];
  const sourceFiles: ProducedFile[] = [];
  for (const artifactPath of artifactPaths) {
    const isWorkProduct = artifactPath.startsWith("agent-artifacts/");
    if (!isWorkProduct && (!task.canWriteWorkspace || !isSafePythonSourcePath(artifactPath) || !isPathAllowedForProductionTask(artifactPath, task.allowedPathScopes))) {
      throw new Error("PYTHON_AGENT_ARTIFACT_SCOPE_INVALID");
    }
    const content = await readFile(safeWorkspacePath(input.workspaceRoot, artifactPath), "utf8");
    if (!content.trim()) throw new Error("PYTHON_AGENT_ARTIFACT_EMPTY");
    if (containsSecretLikeValue(content)) throw new Error("PYTHON_AGENT_ARTIFACT_CONTAINS_SECRET_PATTERN");
    const file = { path: artifactPath, content };
    files.push(file);
    if (!isWorkProduct) sourceFiles.push(file);
  }
  return {
    files,
    sourceFiles,
    additiveActionCount: validateScopedWorkProducts(input, task, files.filter(file => file.path.startsWith("agent-artifacts/"))),
  };
}

function pythonSourceOutcome(task: ProductionAgentTask, sourceFiles: readonly ProducedFile[], pythonExecution: PythonProductionAgentExecution): ProductionAgentOutcome {
  if (!task.canWriteWorkspace || sourceFiles.length === 0) throw new Error("PYTHON_AGENT_SOURCE_OUTPUT_INVALID");
  return {
    status: "succeeded",
    summary: "The selected Python responsibility created request-scoped source files through the constrained workspace adapter.",
    changedFiles: [],
    verification: [{
      name: "python-scoped-source-output",
      result: "pass",
      detail: `Validated ${sourceFiles.length} non-empty source file${sourceFiles.length === 1 ? "" : "s"} within the selected task path scope.`,
    }],
    evidenceRefs: pythonExecution.evidenceRefs,
  };
}

function requiresPythonSourceOutput(task: ProductionAgentTask) {
  // Only implemented source writers must produce source. Review-only and
  // evidence-only responsibilities remain free to return scoped work products
  // without being represented as code-writing execution.
  return PYTHON_SOURCE_WRITER_IDS.has(task.agentId);
}

function validateScopedWorkProducts(input: ProductionAgentWorkerInput, task: ProductionAgentTask, files: readonly ProducedFile[]) {
  const byPath = new Map(files.map(file => [file.path, file]));
  const manifests = files.filter(file => file.path.endsWith(".work-product.json"));
  const isOriginalCanonical = /^agent_0(?:0[1-9]|[1-6][0-9]|70)$/.test(task.agentId);
  const expectedOriginalPrefix = `agent-artifacts/original/${task.agentId}/`;
  const expectedManifest = manifests.find(file => file.path.startsWith(expectedOriginalPrefix));
  if (isOriginalCanonical && !expectedManifest) throw new Error("PYTHON_AGENT_WORK_PRODUCT_INVALID");
  if (!isOriginalCanonical && manifests.length === 0) throw new Error("PYTHON_AGENT_WORK_PRODUCT_INVALID");
  let additiveActionCount = 0;
  for (const manifest of manifests) {
    const reportPath = manifest.path.slice(0, -".work-product.json".length) + ".md";
    if (!byPath.get(reportPath)?.content.trim()) throw new Error("PYTHON_AGENT_WORK_PRODUCT_INVALID");
    try {
      const parsed = JSON.parse(manifest.content) as {
        format?: unknown;
        agentKind?: unknown;
        canonicalAgentId?: unknown;
        buildScope?: { buildRunId?: unknown; projectId?: unknown; conversationId?: unknown; taskId?: unknown };
        actions?: unknown;
        externalActions?: unknown;
      };
      const scope = parsed.buildScope;
      if (
        parsed.format !== "smartbuild-agent-work-product-v1" ||
        typeof parsed.canonicalAgentId !== "string" ||
        parsed.canonicalAgentId !== task.agentId ||
        !scope ||
        scope.buildRunId !== input.scope.buildRunId ||
        scope.projectId !== input.scope.projectId ||
        scope.conversationId !== input.scope.conversationId ||
        scope.taskId !== task.taskId ||
        !Array.isArray(parsed.actions) ||
        parsed.actions.length === 0 ||
        parsed.externalActions !== "not-performed"
      ) throw new Error("invalid");
      if (manifest.path.startsWith(expectedOriginalPrefix) && (
        parsed.agentKind !== "original-canonical" ||
        parsed.actions.length !== 1 ||
        !isOriginalResponsibilityAction(parsed.actions[0])
      )) throw new Error("invalid");
      if (isOriginalCanonical && !manifest.path.startsWith(expectedOriginalPrefix)) throw new Error("invalid");
      if (!isOriginalCanonical && !parsed.actions.every(isAdditiveResponsibilityAction)) throw new Error("invalid");
      additiveActionCount += parsed.actions.length;
    } catch {
      throw new Error("PYTHON_AGENT_WORK_PRODUCT_INVALID");
    }
  }
  return additiveActionCount;
}

function isOriginalResponsibilityAction(action: unknown) {
  return isPlainRecord(action) && action.kind === "responsibility-report" && action.status === "completed" && Object.keys(action).length === 2;
}

function isAdditiveResponsibilityAction(action: unknown) {
  return isPlainRecord(action) &&
    typeof action.id === "string" && action.id.length > 0 &&
    action.status === "proposed" &&
    typeof action.responsibility === "string" && action.responsibility.length > 0 &&
    typeof action.instruction === "string" && action.instruction.length > 0 &&
    Array.isArray(action.verification) && action.verification.length > 0 &&
    action.verification.every(item => typeof item === "string" && item.length > 0);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function safeExecutionLog(outcome: ProductionAgentOutcome, artifactCount: number, additiveActionCount: number, pythonMetadata?: PythonProductionExecutionMetadata) {
  const verificationPassed = outcome.verification.filter(check => check.result === "pass").length;
  const verificationBlocked = outcome.verification.filter(check => check.result === "blocked").length;
  const python = pythonMetadata ?? { producedArtifactCount: 0, verificationCount: 0, nextActionCount: 0 };
  return `smartbuild-agent-execution-v1 artifacts=${Math.max(0, artifactCount)} verification_passed=${verificationPassed} verification_blocked=${verificationBlocked} additive_actions=${Math.max(0, additiveActionCount)} python_produced_artifacts=${python.producedArtifactCount} python_verifications=${python.verificationCount} python_next_actions=${python.nextActionCount}`;
}

const safeFailureCode = (error: unknown) => {
  const detail = error instanceof Error ? error.message : "";
  if (/ANTHROPIC_STREAM_RATE_LIMIT_ERROR|Anthropic (?:stream|structured request) failed with status 429/i.test(detail)) return "ANTHROPIC_RATE_LIMITED";
  if (/ANTHROPIC_STREAM_BILLING_ERROR|Anthropic (?:stream|structured request) failed with status 402/i.test(detail)) return "ANTHROPIC_BILLING_REQUIRED";
  if (/ANTHROPIC_STREAM_OVERLOADED_ERROR|Anthropic (?:stream|structured request) failed with status 529/i.test(detail)) return "ANTHROPIC_TEMPORARILY_UNAVAILABLE";
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "AGENT_PROVIDER_REQUEST_TIMEOUT";
  if (error instanceof TypeError && /fetch|network|socket|connection/i.test(detail)) return "AGENT_PROVIDER_CONNECTION_FAILED";
  const code = detail || "AGENT_EXECUTION_UNKNOWN";
  return /^[A-Z0-9_]{3,80}$/.test(code) ? code : "AGENT_EXECUTION_FAILED";
};

const SAFE_BLOCKER_CODES = new Set([
  "AGENT_DEFINITION_NOT_FOUND",
  "AGENT_TASK_BLOCKED",
  "EXTERNAL_CAPABILITY_UNAVAILABLE",
  "EXTERNAL_PROVIDER_NOT_CONFIGURED",
  "INTEGRATION_NOT_CONFIGURED",
]);

function safeBlockedReason(value: unknown): string {
  const candidate = typeof value === "string" ? value : "";
  return SAFE_BLOCKER_CODES.has(candidate) ? candidate : "AGENT_TASK_BLOCKED";
}

/**
 * Processes no more than one task. The durable queue's conditional lease is the
 * concurrency fence; callers may invoke this repeatedly from a reserved worker
 * or heartbeat without overlapping selected agents for the same Build Run.
 */
export async function runOneProductionAgentTask(
  input: ProductionAgentWorkerInput,
  dependencies: ProductionAgentWorkerDependencies = {}
): Promise<ProductionAgentWorkerResult> {
  const leaseToken = randomUUID();
  const claim = dependencies.claim ?? claimNextDurableBuildRunAgentTask;
  const renew = dependencies.renew ?? renewDurableBuildRunAgentTaskLease;
  const complete = dependencies.complete ?? completeDurableBuildRunAgentTask;
  const execute: NonNullable<ProductionAgentWorkerDependencies["execute"]> = dependencies.execute ?? ((task, context) => {
    const invoke: AgentModelInvoker | undefined = input.model === AI_MODEL_IDS.claude ? invokeAnthropicStructured : undefined;
    return executeProductionAgent(task, context, invoke);
  });
  const executePython = dependencies.executePython ?? (dependencies.execute ? undefined : runOnePythonProductionAgent);
  const persist = dependencies.persist ?? persistProductionAgentFiles;
  const persistEvidence = dependencies.persistEvidence ?? persistProductionAgentEvidence;
  const claimed = await claim(input.scope, leaseToken, AGENT_TASK_LEASE_MS);
  if (!claimed) return { state: "idle" };
  const task = input.tasks.find(candidate => candidate.taskId === claimed.taskId && candidate.agentId === claimed.agentId);
  if (!task) {
    await complete(input.scope, claimed.taskId, leaseToken, {
      status: "blocked",
      blockedReason: "AGENT_DEFINITION_NOT_FOUND",
      logs: ["The durable task has no matching implementation definition."],
    });
    return { state: "blocked", taskId: claimed.taskId, agentId: claimed.agentId, reason: "AGENT_DEFINITION_NOT_FOUND" };
  }
  if (task.agentId === WEBSITE_BUILDER_AGENT_ID) {
    await complete(input.scope, task.taskId, leaseToken, {
      status: "blocked",
      blockedReason: "BUILD_EXECUTION_DISABLED",
      logs: ["Implementation tasks are disabled; existing project data is unchanged."],
    });
    return { state: "blocked", taskId: task.taskId, agentId: task.agentId, reason: "BUILD_EXECUTION_DISABLED" };
  }

  let leaseLost = false;
  let renewalInProgress = false;
  const leaseRenewal = setInterval(() => {
    if (renewalInProgress || leaseLost) return;
    renewalInProgress = true;
    void renew(input.scope, task.taskId, leaseToken, AGENT_TASK_LEASE_MS)
      .then(renewed => {
        if (!renewed) leaseLost = true;
      })
      .catch(error => {
        console.warn("[ProductionAgent] Could not renew task lease", task.taskId, safeFailureCode(error));
      })
      .finally(() => { renewalInProgress = false; });
  }, AGENT_TASK_LEASE_RENEW_INTERVAL_MS);
  leaseRenewal.unref();

  try {
    let pythonExecution: PythonProductionAgentExecution | undefined;
    const useCanonicalPythonWriter = input.model !== AI_MODEL_IDS.claude &&
      shouldUseCanonicalPythonWriter(task.agentId, dependencies.executePython !== undefined);
    if (executePython && task.canWriteWorkspace && useCanonicalPythonWriter) {
      pythonExecution = await executePython({
        buildRunId: input.scope.buildRunId,
        projectId: input.scope.projectId,
        conversationId: input.scope.conversationId,
        request: input.requirement,
        workspaceRoot: input.workspaceRoot,
        taskId: task.taskId,
        agentId: task.agentId,
      });
      if (pythonExecution.status === "blocked") {
        const reason = safeBlockedReason(pythonExecution.blockedReason);
        const blockedOutcome: ProductionAgentOutcome = {
          status: "blocked",
          summary: "The selected Python responsibility reported a scoped blocker before file generation.",
          changedFiles: [],
          verification: [{ name: "python-responsibility", result: "blocked", detail: reason }],
          blockedReason: reason,
          evidenceRefs: pythonExecution.evidenceRefs,
        };
        const evidenceRefs = await persistEvidence(input, task, blockedOutcome);
        await complete(input.scope, task.taskId, leaseToken, { status: "blocked", blockedReason: reason, evidenceRefs, logs: [safeExecutionLog(blockedOutcome, 0, 0, pythonExecution.executionMetadata), "The selected Python responsibility reported a scoped blocker."] });
        return { state: "blocked", taskId: task.taskId, agentId: task.agentId, reason };
      }
    }
    const pythonOutputs = pythonExecution
      ? await readScopedPythonOutputs(input, task, pythonExecution.changedFiles)
      : undefined;
    if (pythonExecution && requiresPythonSourceOutput(task) && pythonOutputs!.sourceFiles.length === 0) {
      throw new Error("PYTHON_AGENT_SOURCE_OUTPUT_INVALID");
    }
    const outcome = pythonOutputs && pythonOutputs.sourceFiles.length > 0
      ? pythonSourceOutcome(task, pythonOutputs.sourceFiles, pythonExecution!)
      : !task.canWriteWorkspace || (pythonExecution && !requiresPythonSourceOutput(task))
        ? {
            status: "succeeded" as const,
            summary: task.canWriteWorkspace
              ? "The scoped Python responsibility completed without additional source changes."
              : "The review-only responsibility completed without a model round-trip or workspace changes.",
            changedFiles: [],
            verification: [{ name: "scoped-responsibility", result: "pass" as const, detail: "No additional source files were required for this responsibility." }],
            evidenceRefs: pythonExecution?.evidenceRefs || [],
          }
        : await execute(task, {
          buildRunId: input.scope.buildRunId,
          projectId: input.scope.projectId,
          conversationId: input.scope.conversationId,
          ...(input.model ? { model: input.model } : {}),
          requirement: input.requirement,
          knownFiles: input.knownFiles,
          sourceFiles: await readScopedSourceFiles(input, task),
          workspaceRoot: input.workspaceRoot,
        });
    if (leaseLost) throw new Error("AGENT_LEASE_LOST");
    if (outcome.status === "blocked") {
      const reason = safeBlockedReason(outcome.blockedReason);
      outcome.blockedReason = reason;
      const evidenceRefs = await persistEvidence(input, task, outcome);
      await complete(input.scope, task.taskId, leaseToken, {
        status: "blocked", blockedReason: reason, evidenceRefs, logs: [safeExecutionLog(outcome, 0, 0, pythonExecution?.executionMetadata), "The scoped agent reported a blocker without writing project files."],
      });
      return { state: "blocked", taskId: task.taskId, agentId: task.agentId, reason };
    }
    assertUniqueProducedFilePaths(outcome.changedFiles);
    let additiveActionCount = 0;
    if (pythonExecution && pythonOutputs) {
      const baseOutputPaths = new Set(outcome.changedFiles.map(file => file.path));
      const combinedFiles = new Map(outcome.changedFiles.map(file => [file.path, file]));
      additiveActionCount = pythonOutputs.additiveActionCount;
      for (const file of pythonOutputs.files) {
        if (baseOutputPaths.has(file.path)) throw new Error("AGENT_OUTPUT_PATH_DUPLICATE");
        combinedFiles.set(file.path, file);
      }
      outcome.changedFiles = Array.from(combinedFiles.values());
      outcome.evidenceRefs = [...outcome.evidenceRefs, ...pythonExecution.evidenceRefs, `agent-trace:${pythonExecution.traceFile}`];
    }
    const artifactRefs = await persist(input, outcome.changedFiles);
    const evidenceRefs = await persistEvidence(input, task, outcome);
    const completed = await complete(input.scope, task.taskId, leaseToken, {
      status: "succeeded",
      outputArtifactRefs: artifactRefs,
      evidenceRefs,
      logs: [safeExecutionLog(outcome, artifactRefs.length, additiveActionCount, pythonExecution?.executionMetadata), "The scoped agent completed its bounded request-scoped task."],
    });
    if (!completed) return { state: "failed", taskId: task.taskId, agentId: task.agentId, code: "AGENT_LEASE_LOST" };
    return { state: "succeeded", taskId: task.taskId, agentId: task.agentId, artifactRefs, evidenceRefs };
  } catch (error) {
    const code = safeFailureCode(error);
    await complete(input.scope, task.taskId, leaseToken, {
      status: "failed", blockedReason: code, logs: ["The scoped agent failed before validated artifact persistence."],
    });
    return { state: "failed", taskId: task.taskId, agentId: task.agentId, code };
  } finally {
    clearInterval(leaseRenewal);
  }
}
