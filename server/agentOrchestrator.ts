import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PythonRuntimeResolutionError, pythonRuntimeEnvironment, resolvePythonRuntime } from "./pythonRuntime";
import { WEBSITE_BUILDER_AGENT_ID, WEBSITE_BUILDER_AGENT_NAME } from "./websiteBuilderAgent";

const execFileAsync = promisify(execFile);
const RUNNER = "server.agents.runner";

export type PublicAgentPlan = {
  runId: string;
  selectedAgents: Array<{ id: string; name: string; team: string; role: string; modelProfile: string; selected: true }>;
  skippedAgents: Array<{ id: string; reason: string }>;
  tasks: Array<{ taskId: string; agentId: string; title: string; dependsOn: string[]; locks: string[]; verificationMethods: string[]; selectedReason: string }>;
  blockedReason: string | null;
  policy: Record<string, unknown>;
};

export const CANONICAL_AGENT_COUNT = 300;

const SAFE_SKIPPED_REASON_CODES = new Set(["TRIGGER_NOT_MATCHED_OR_NOT_REQUIRED"]);
const SAFE_SELECTED_REASON_CODES = new Set([
  "REQUEST_CAPABILITY_MATCH",
  "SCOPED_WORKFLOW_DEPENDENCY",
  "VERIFICATION_GATE_REQUIRED",
  "CHECKPOINT_AFTER_VERIFICATION",
]);

export type AgentOrchestrationSummary = {
  registryCount: number;
  executionMode: "dry-run";
  checkpointAllowed: boolean;
  selectedAgents: PublicAgentPlan["selectedAgents"];
  skippedAgents: PublicAgentPlan["skippedAgents"];
  tasks: PublicAgentPlan["tasks"];
  traceFile?: string;
  blockedReason: string | null;
  internalizedCapabilityCount?: number;
};

type RunnerPayload = {
  ok: boolean;
  error?: string;
  registryCount?: number;
  plan?: PublicAgentPlan;
  execution?: { checkpointAllowed: boolean; traceFile?: string; taskGraph: unknown; acceptanceRows: unknown[] };
};

type SingleAgentRunnerPayload = {
  ok: boolean;
  error?: string;
  registryCount?: number;
  agentExecution?: {
    executionMode: "production";
    agentId: string;
    taskId: string;
    status: "succeeded" | "blocked" | "failed" | "waiting_for_secret" | "waiting_for_feedback" | "waiting_for_clarification";
    changedFiles: string[];
    evidenceRefs: string[];
    executionMetadata: {
      producedArtifactCount: number;
      verificationCount: number;
      nextActionCount: number;
    };
    blockedReason: string | null;
    traceFile: string;
  };
};

export type PythonProductionExecutionMetadata = {
  producedArtifactCount: number;
  verificationCount: number;
  nextActionCount: number;
};

export type PythonProductionAgentExecution = {
  status: "succeeded" | "blocked";
  evidenceRefs: string[];
  changedFiles: string[];
  traceFile: string;
  executionMetadata: PythonProductionExecutionMetadata;
  blockedReason?: string;
};

function lastJsonLine(stdout: string): unknown {
  const line = stdout.trim().split("\n").filter(Boolean).at(-1);
  if (!line) throw new Error("AGENT_SUPERVISOR_NO_OUTPUT");
  try { return JSON.parse(line); } catch { throw new Error("AGENT_SUPERVISOR_INVALID_OUTPUT"); }
}

function parseRunnerPayload(stdout: string): RunnerPayload {
  const parsed = lastJsonLine(stdout) as RunnerPayload;
  if (!parsed.ok) throw new Error(parsed.error || "AGENT_SUPERVISOR_FAILED");
  if (parsed.registryCount !== CANONICAL_AGENT_COUNT || !parsed.plan || !parsed.execution) throw new Error("AGENT_REGISTRY_INTEGRITY_FAILED");
  if (
    !Array.isArray(parsed.plan.skippedAgents) ||
    !Array.isArray(parsed.plan.tasks) ||
    parsed.plan.skippedAgents.some(item => !item || typeof item.id !== "string" || !SAFE_SKIPPED_REASON_CODES.has(item.reason)) ||
    parsed.plan.tasks.some(item => !item || typeof item.taskId !== "string" || typeof item.agentId !== "string" || !SAFE_SELECTED_REASON_CODES.has(item.selectedReason))
  ) {
    throw new Error("AGENT_SELECTION_REASON_INVALID");
  }
  return parsed;
}

function parseSingleAgentRunnerPayload(stdout: string): SingleAgentRunnerPayload {
  const parsed = lastJsonLine(stdout) as SingleAgentRunnerPayload;
  if (!parsed.ok) throw new Error(parsed.error || "AGENT_SUPERVISOR_FAILED");
  if (parsed.registryCount !== CANONICAL_AGENT_COUNT || !parsed.agentExecution || parsed.agentExecution.executionMode !== "production") {
    throw new Error("AGENT_REGISTRY_INTEGRITY_FAILED");
  }
  return parsed;
}

function safePythonExecutionMetadata(value: unknown): PythonProductionExecutionMetadata {
  if (!value || typeof value !== "object") throw new Error("AGENT_PYTHON_EXECUTION_METADATA_INVALID");
  const record = value as Record<string, unknown>;
  const count = (name: keyof PythonProductionExecutionMetadata) => {
    const candidate = record[name];
    if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate < 0 || candidate > 10_000) {
      throw new Error("AGENT_PYTHON_EXECUTION_METADATA_INVALID");
    }
    return candidate;
  };
  return {
    producedArtifactCount: count("producedArtifactCount"),
    verificationCount: count("verificationCount"),
    nextActionCount: count("nextActionCount"),
  };
}

function validateWorkspaceRoot(workspaceRoot: string) {
  const configuredWorkspaceRoot = path.resolve(
    process.env.SMARTBUILD_WORKSPACE_ROOT || path.join(process.cwd(), ".smartbuild-cloud-workspaces"),
  );
  if (!workspaceRoot.startsWith(`${configuredWorkspaceRoot}${path.sep}`)) throw new Error("AGENT_WORKSPACE_SCOPE_INVALID");
}

async function resolveScopedPython(component: string, evidenceRoot: string) {
  try {
    const runtime = await resolvePythonRuntime({ component, workingDirectory: process.cwd(), requiredModules: ["json"] });
    await writeFile(path.join(evidenceRoot, `python-runtime-${component}.json`), JSON.stringify(runtime.diagnostic, null, 2));
    return runtime.executable;
  } catch (error) {
    if (error instanceof PythonRuntimeResolutionError) {
      await writeFile(path.join(evidenceRoot, `python-runtime-${component}.json`), JSON.stringify(error.diagnostic, null, 2));
      throw new Error("AGENT_PYTHON_RUNTIME_UNAVAILABLE");
    }
    throw error;
  }
}

export async function runBuildAgentOrchestration(input: { buildRunId: string; projectId: number; conversationId: number; request: string; workspaceRoot: string }): Promise<AgentOrchestrationSummary> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const evidenceRoot = path.join(workspaceRoot, "evidence");
  const traceRoot = path.join(evidenceRoot, "agent-traces");
  validateWorkspaceRoot(workspaceRoot);
  await mkdir(traceRoot, { recursive: true });
  const python = await resolveScopedPython("agent-orchestrator", evidenceRoot);
  const { stdout } = await execFileAsync(python, ["-m", RUNNER, "--request", input.request, "--run-id", input.buildRunId, "--workspace-id", `project-${input.projectId}`, "--project-id", String(input.projectId), "--conversation-id", String(input.conversationId), "--workspace-root", workspaceRoot, "--trace-root", traceRoot, "--mode", "dry-run"], {
    cwd: process.cwd(), env: pythonRuntimeEnvironment({ PYTHONPATH: process.cwd() }), timeout: 20_000, maxBuffer: 512 * 1024,
  });
  const payload = parseRunnerPayload(stdout);
  const plan = payload.plan!;
  const execution = payload.execution!;
  const expectedTraceFile = `${input.buildRunId}.jsonl`;
  if (execution.traceFile && execution.traceFile !== expectedTraceFile) throw new Error("AGENT_TRACE_SCOPE_INVALID");
  const summary: AgentOrchestrationSummary = {
    registryCount: payload.registryCount!,
    executionMode: "dry-run",
    checkpointAllowed: execution.checkpointAllowed,
    selectedAgents: [{
      id: WEBSITE_BUILDER_AGENT_ID,
      name: WEBSITE_BUILDER_AGENT_NAME,
      team: "website-building",
      role: "Analyzes, implements, and reviews the requested website",
      modelProfile: "deep_reasoning",
      selected: true,
    }],
    skippedAgents: plan.skippedAgents,
    tasks: [{
      taskId: `${input.buildRunId}:website-builder`,
      agentId: WEBSITE_BUILDER_AGENT_ID,
      title: "Analyze and implement the website",
      dependsOn: [],
      locks: ["project-write"],
      verificationMethods: ["validated-file-output", "workspace-path-scope"],
      selectedReason: "REQUEST_CAPABILITY_MATCH",
    }],
    traceFile: execution.traceFile,
    blockedReason: plan.blockedReason,
    internalizedCapabilityCount: plan.selectedAgents.length,
  };
  await writeFile(path.join(evidenceRoot, "agent-plan.json"), JSON.stringify({
    ...summary,
    capabilityPlan: plan,
    taskGraph: execution.taskGraph,
    acceptanceRows: execution.acceptanceRows,
  }, null, 2));
  return summary;
}

/** Executes precisely one selected Python responsibility after the queue acquires its durable lease. */
export async function runOnePythonProductionAgent(input: { buildRunId: string; projectId: number; conversationId: number; request: string; workspaceRoot: string; taskId: string; agentId: string }): Promise<PythonProductionAgentExecution> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  validateWorkspaceRoot(workspaceRoot);
  const evidenceRoot = path.join(workspaceRoot, "evidence");
  const traceRoot = path.join(evidenceRoot, "agent-traces");
  await mkdir(traceRoot, { recursive: true });
  const python = await resolveScopedPython("agent-production-task", evidenceRoot);
  const { stdout } = await execFileAsync(python, ["-m", RUNNER, "--request", input.request, "--run-id", input.buildRunId, "--workspace-id", `project-${input.projectId}`, "--project-id", String(input.projectId), "--conversation-id", String(input.conversationId), "--workspace-root", workspaceRoot, "--trace-root", traceRoot, "--mode", "production", "--agent-id", input.agentId], {
    cwd: process.cwd(), env: pythonRuntimeEnvironment({ PYTHONPATH: process.cwd() }), timeout: 20_000, maxBuffer: 512 * 1024,
  });
  const payload = parseSingleAgentRunnerPayload(stdout);
  const execution = payload.agentExecution!;
  if (execution.agentId !== input.agentId || execution.taskId !== input.taskId || execution.traceFile !== `${input.buildRunId}.jsonl`) {
    throw new Error("AGENT_SINGLE_EXECUTION_SCOPE_INVALID");
  }
  const executionMetadata = safePythonExecutionMetadata(execution.executionMetadata);
  const evidenceRefs = execution.evidenceRefs.filter(ref => ref.startsWith("evidence/agent-executions/") && ref.includes("#sha256:"));
  if (evidenceRefs.length !== execution.evidenceRefs.length) throw new Error("AGENT_EVIDENCE_REFERENCE_INVALID");
  if (execution.status === "succeeded") return { status: "succeeded", evidenceRefs, changedFiles: execution.changedFiles, traceFile: execution.traceFile, executionMetadata };
  if (["blocked", "waiting_for_secret", "waiting_for_feedback", "waiting_for_clarification"].includes(execution.status)) {
    return { status: "blocked", evidenceRefs, changedFiles: [], traceFile: execution.traceFile, executionMetadata, blockedReason: execution.blockedReason || "AGENT_TASK_BLOCKED" };
  }
  throw new Error("AGENT_PYTHON_EXECUTION_FAILED");
}
