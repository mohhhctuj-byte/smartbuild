export type PublicPlan = {
  registryCount?: unknown;
  executionMode?: unknown;
  selectedAgents?: unknown;
  skippedAgents?: unknown;
  tasks?: unknown;
  traceFile?: unknown;
};

type TraceRow = {
  agentId?: unknown;
  taskId?: unknown;
  event?: unknown;
  status?: unknown;
  timestampMs?: unknown;
  evidenceRefs?: unknown;
};

export type ProductionTaskRow = {
  taskId?: unknown;
  agentId?: unknown;
  executionOrder?: unknown;
  status?: unknown;
  implementationHash?: unknown;
  outputArtifactRefs?: unknown;
  evidenceRefs?: unknown;
  logs?: unknown;
  executionSummary?: unknown;
  blockedReason?: unknown;
  createdAt?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
  updatedAt?: unknown;
};

type PublicArtifactDetail = {
  path: string;
  category: "ORIGINAL_REPORT" | "ADDITIVE_REPORT" | "WORK_PRODUCT_MANIFEST" | "SCOPED_ARTIFACT";
};

export type PublicExecutionSummary = {
  artifactCount: number;
  verification: { passed: number; blocked: number };
  additiveActionCount: number;
  pythonExecution: { producedArtifactCount: number; verificationCount: number; nextActionCount: number } | null;
};

export type AgentExecutionEvidence = {
  tuple: { projectId: number; conversationId: number; buildRunId: string };
  registryCount: typeof CANONICAL_AGENT_COUNT;
  executionMode: "dry-run" | "production";
  totals: { selected: number; skipped: number; planned: number; traceObserved: number; running: number; succeeded: number; blocked: number; failed: number };
  trace: { file: string | null; present: boolean; eventCount: number };
  agents: Array<{
    id: string;
    name: string;
    team: string;
    role: string;
    status: "SKIPPED" | "PLANNED" | "DRY_RUN_OBSERVED" | "REGISTERED" | "SELECTED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "BLOCKED";
    sequence: number | null;
    timestamp: string | null;
    lastEvent: string | null;
    evidenceRefs: string[];
    artifactRefs: string[];
    artifactDetails: PublicArtifactDetail[];
    executionSummary: PublicExecutionSummary | null;
    implementationHash: string | null;
    selectionReason: string;
    detail: string;
  }>;
};

function text(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
const sensitivePathSegment = /(?:^|\/)(?:\.env(?:\.[^/]*)?|secrets?|credentials?|private|sessions?|tokens?)(?:\/|$)/i;
const sensitivePathExtension = /\.(?:pem|key|p12|pfx|sqlite|db|log)$/i;
function isSensitivePath(value: string): boolean {
  return sensitivePathSegment.test(value) || sensitivePathExtension.test(value);
}
function publicEvidenceRef(value: unknown): string | null {
  if (typeof value !== "string" || !/^evidence\/[a-zA-Z0-9][a-zA-Z0-9._/-]{0,240}$/.test(value) || value.includes("..") || value.includes("\\")) return null;
  return isSensitivePath(value) ? null : value;
}
function publicArtifactRef(value: unknown): string | null {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,240}$/.test(value) || value.includes("..") || value.includes("\\") || value.startsWith("evidence/")) return null;
  return isSensitivePath(value) ? null : value;
}
function publicArtifactDetail(value: unknown): PublicArtifactDetail | null {
  const path = publicArtifactRef(value);
  if (!path) return null;
  if (path.startsWith("agent-artifacts/") && path.endsWith(".work-product.json")) return { path, category: "WORK_PRODUCT_MANIFEST" };
  if (path.startsWith("agent-artifacts/original/") && path.endsWith(".md")) return { path, category: "ORIGINAL_REPORT" };
  if (path.startsWith("agent-artifacts/") && path.endsWith(".md")) return { path, category: "ADDITIVE_REPORT" };
  return { path, category: "SCOPED_ARTIFACT" };
}
export function publicExecutionSummary(value: unknown): PublicExecutionSummary | null {
  const logs = Array.isArray(value) ? value : [];
  const currentPattern = /^smartbuild-agent-execution-v1 artifacts=(\d{1,4}) verification_passed=(\d{1,4}) verification_blocked=(\d{1,4}) additive_actions=(\d{1,4}) python_produced_artifacts=(\d{1,4}) python_verifications=(\d{1,4}) python_next_actions=(\d{1,4})$/;
  const legacyPattern = /^smartbuild-agent-execution-v1 artifacts=(\d{1,4}) verification_passed=(\d{1,4}) verification_blocked=(\d{1,4}) additive_actions=(\d{1,4})$/;
  for (const log of logs) {
    const match = typeof log === "string" ? log.match(currentPattern) ?? log.match(legacyPattern) : null;
    if (!match) continue;
    const values = match.slice(1).map(Number);
    if (values.every(Number.isSafeInteger)) {
      const [artifactCount, passed, blocked, additiveActionCount, producedArtifactCount, verificationCount, nextActionCount] = values;
      return {
        artifactCount,
        verification: { passed, blocked },
        additiveActionCount,
        pythonExecution: producedArtifactCount === undefined || verificationCount === undefined || nextActionCount === undefined
          ? null
          : { producedArtifactCount, verificationCount, nextActionCount },
      };
    }
  }
  return null;
}
function safeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
export function validatedPublicExecutionSummary(value: unknown): PublicExecutionSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const verification = candidate.verification;
  if (!safeCount(candidate.artifactCount) || !safeCount(candidate.additiveActionCount) || !verification || typeof verification !== "object" || Array.isArray(verification)) return null;
  const verificationRecord = verification as Record<string, unknown>;
  if (!safeCount(verificationRecord.passed) || !safeCount(verificationRecord.blocked)) return null;
  const base = { artifactCount: candidate.artifactCount, verification: { passed: verificationRecord.passed, blocked: verificationRecord.blocked }, additiveActionCount: candidate.additiveActionCount };
  if (candidate.pythonExecution === null || candidate.pythonExecution === undefined) return { ...base, pythonExecution: null };
  if (typeof candidate.pythonExecution !== "object" || Array.isArray(candidate.pythonExecution)) return null;
  const python = candidate.pythonExecution as Record<string, unknown>;
  if (!safeCount(python.producedArtifactCount) || !safeCount(python.verificationCount) || !safeCount(python.nextActionCount)) return null;
  return { ...base, pythonExecution: { producedArtifactCount: python.producedArtifactCount, verificationCount: python.verificationCount, nextActionCount: python.nextActionCount } };
}
function publicHash(value: unknown): string | null { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null; }
function publicTimestamp(...values: unknown[]): string | null {
  for (const value of values) {
    const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
    if (date && Number.isFinite(date.getTime())) return date.toISOString();
  }
  return null;
}
function safeEvent(value: unknown): string | null {
  const candidate = text(value).trim();
  return /^[a-z0-9._-]{1,80}$/i.test(candidate) ? candidate : null;
}
function safeReasonCode(value: unknown, fallback: string): string {
  const candidate = text(value).trim();
  return /^[A-Z][A-Z0-9_]{2,79}$/.test(candidate) ? candidate : fallback;
}
const SAFE_BLOCKER_CODES = new Set([
  "AGENT_DEFINITION_NOT_FOUND",
  "AGENT_TASK_BLOCKED",
  "EXTERNAL_CAPABILITY_UNAVAILABLE",
  "EXTERNAL_PROVIDER_NOT_CONFIGURED",
  "INTEGRATION_NOT_CONFIGURED",
  "SCOPED_SOURCE_NOT_AVAILABLE",
  "PYTHON_AGENT_SOURCE_OUTPUT_INVALID",
  "PYTHON_AGENT_WORK_PRODUCT_INVALID",
]);
function publicBlockedReason(value: unknown): string {
  const candidate = text(value).trim();
  return SAFE_BLOCKER_CODES.has(candidate) ? candidate : "AGENT_TASK_BLOCKED";
}
function selectedReasonCodes(plan: PublicPlan): Map<string, string> {
  const codes = new Map<string, string>();
  for (const task of Array.isArray(plan.tasks) ? plan.tasks : []) {
    if (!task || typeof task !== "object" || Array.isArray(task)) continue;
    const value = task as Record<string, unknown>;
    const agentId = text(value.agentId).trim();
    if (agentId && !codes.has(agentId)) codes.set(agentId, safeReasonCode(value.selectedReason, "SCOPED_WORKFLOW_DEPENDENCY"));
  }
  return codes;
}

function duplicateAgentIds(agents: readonly unknown[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const agent of agents) {
    if (!agent || typeof agent !== "object" || Array.isArray(agent)) continue;
    const id = text((agent as Record<string, unknown>).id).trim();
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return duplicates;
}
function traceRows(raw: string): TraceRow[] {
  return raw.split("\n").flatMap(line => {
    try { const parsed = JSON.parse(line) as TraceRow; return typeof parsed === "object" && parsed ? [parsed] : []; } catch { return []; }
  });
}

export type AgentEvidenceRunIdentity = {
  id: string;
  userId: number;
  projectId: number;
  conversationId: number;
};

export function buildAgentEvidenceForRun(input: {
  requestingUserId: number;
  run: AgentEvidenceRunIdentity | null;
  plan?: PublicPlan;
  traceContent?: string | null;
  productionTasks?: readonly ProductionTaskRow[];
}): { status: 200; body: { buildRunId: string; evidence: AgentExecutionEvidence } } | { status: 404; body: { buildRunId: string | null; error: "Agent orchestration evidence is unavailable for this build run." } } {
  const run = input.run;
  if (!run || run.userId !== input.requestingUserId || !Number.isSafeInteger(run.projectId) || run.projectId <= 0 || !Number.isSafeInteger(run.conversationId) || run.conversationId <= 0 || !run.id) {
    return { status: 404, body: { buildRunId: run?.id ?? null, error: "Agent orchestration evidence is unavailable for this build run." } };
  }
  return {
    status: 200,
    body: {
      buildRunId: run.id,
      evidence: buildAgentExecutionEvidence({
        projectId: run.projectId,
        conversationId: run.conversationId,
        buildRunId: run.id,
        plan: input.plan ?? {},
        traceContent: input.traceContent,
        productionTasks: input.productionTasks,
      }),
    },
  };
}

/**
 * Transforms the local supervisor trace into an API-safe evidence view. A
 * dry-run trace may prove selection and supervisor callbacks, but never proves
 * autonomous code-writing or live external work; the returned labels preserve
 * that distinction.
 */
export function buildAgentExecutionEvidence(input: { projectId: number; conversationId: number; buildRunId: string; plan: PublicPlan; traceContent?: string | null; productionTasks?: readonly ProductionTaskRow[] }): AgentExecutionEvidence {
  const selected = Array.isArray(input.plan.selectedAgents) ? input.plan.selectedAgents : [];
  const skipped = Array.isArray(input.plan.skippedAgents) ? input.plan.skippedAgents : [];
  const selectedReasons = selectedReasonCodes(input.plan);
  if (input.productionTasks && input.productionTasks.length > 0) {
    const tasksByAgent = new Map<string, ProductionTaskRow>();
    const ambiguousTaskAgents = new Set<string>();
    const ambiguousSelectedAgents = duplicateAgentIds(selected);
    for (const task of input.productionTasks) {
      const agentId = text(task.agentId).trim();
      const taskId = text(task.taskId).trim();
      if (!agentId || !taskId || ambiguousTaskAgents.has(agentId)) continue;
      if (tasksByAgent.has(agentId)) {
        tasksByAgent.delete(agentId);
        ambiguousTaskAgents.add(agentId);
        continue;
      }
      tasksByAgent.set(agentId, task);
    }
    const selectedRows = selected.map((agent, index) => {
      const value = agent as Record<string, unknown>;
      const id = text(value.id);
      const selectedPlanIsAmbiguous = ambiguousSelectedAgents.has(id);
      const taskIsAmbiguous = ambiguousTaskAgents.has(id);
      const task = selectedPlanIsAmbiguous || taskIsAmbiguous ? undefined : tasksByAgent.get(id);
      const artifactDetails = Array.from(new Map((Array.isArray(task?.outputArtifactRefs) ? task.outputArtifactRefs : []).map(publicArtifactDetail).filter((entry): entry is PublicArtifactDetail => Boolean(entry)).map(entry => [entry.path, entry])).values());
      const rawStatus = text(task?.status).toLowerCase();
      const status = rawStatus === "succeeded" ? "SUCCEEDED" as const : rawStatus === "running" ? "RUNNING" as const : rawStatus === "blocked" || rawStatus === "cancelled" ? "BLOCKED" as const : rawStatus === "failed" ? "FAILED" as const : task ? "SELECTED" as const : "BLOCKED" as const;
      const resultCode = publicBlockedReason(task?.blockedReason);
      const selectionReason = selectedReasons.get(id) ?? "SCOPED_WORKFLOW_DEPENDENCY";
      return {
        id, name: text(value.name, id), team: text(value.team), role: text(value.role), status,
        sequence: typeof task?.executionOrder === "number" && Number.isSafeInteger(task.executionOrder) ? task.executionOrder : index + 1,
        timestamp: publicTimestamp(task?.completedAt, task?.updatedAt, task?.startedAt, task?.createdAt),
        lastEvent: task ? `task.${rawStatus || "planned"}` : "task.missing",
        evidenceRefs: Array.from(new Set((Array.isArray(task?.evidenceRefs) ? task.evidenceRefs : []).map(publicEvidenceRef).filter((entry): entry is string => Boolean(entry)))),
        artifactRefs: artifactDetails.map(entry => entry.path), artifactDetails, executionSummary: validatedPublicExecutionSummary(task?.executionSummary) ?? publicExecutionSummary(task?.logs),
        implementationHash: publicHash(task?.implementationHash),
        selectionReason,
        detail: selectedPlanIsAmbiguous
          ? "Selected agent plan is ambiguous; production task evidence is withheld."
          : taskIsAmbiguous
            ? "Multiple production task rows were found; execution evidence is withheld."
            : !task
              ? "Selected production task evidence is missing; this Build Run cannot advance as verified."
              : text(task?.blockedReason)
                ? `Production task reported: ${resultCode}.`
                : `Production task is ${rawStatus || "planned"}.`, index,
      };
    });
    const skippedRows = skipped.map((agent, index) => {
      const value = agent as Record<string, unknown>;
      const selectionReason = safeReasonCode(value.reason, "SCOPED_PLAN_NOT_SELECTED");
      return { id: text(value.id), name: text(value.id), team: "", role: "", status: "SKIPPED" as const, sequence: null, timestamp: null, lastEvent: null, evidenceRefs: [], artifactRefs: [], artifactDetails: [], executionSummary: null, implementationHash: null, selectionReason, detail: `Not selected: ${selectionReason}.`, index };
    });
    const agents = [...selectedRows, ...skippedRows].sort((a, b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.index - b.index).map(({ index: _index, ...agent }) => agent);
    return {
      tuple: { projectId: input.projectId, conversationId: input.conversationId, buildRunId: input.buildRunId }, registryCount: CANONICAL_AGENT_COUNT, executionMode: "production",
      totals: { selected: selected.length, skipped: skipped.length, planned: 0, traceObserved: 0, running: selectedRows.filter(agent => agent.status === "RUNNING").length, succeeded: selectedRows.filter(agent => agent.status === "SUCCEEDED").length, blocked: selectedRows.filter(agent => agent.status === "BLOCKED").length, failed: selectedRows.filter(agent => agent.status === "FAILED").length },
      trace: { file: null, present: false, eventCount: 0 }, agents,
    };
  }
  const rows = traceRows(input.traceContent || "");
  const traceFile = text(input.plan.traceFile);
  const eventsByAgent = new Map<string, Array<{ event: string | null; status: string; timestampMs: number; evidenceRefs: string[]; order: number }>>();
  rows.forEach((row, index) => {
    const id = text(row.agentId).trim();
    const timestampMs = typeof row.timestampMs === "number" && Number.isFinite(row.timestampMs) ? row.timestampMs : 0;
    if (!id || timestampMs <= 0) return;
    const bucket = eventsByAgent.get(id) || [];
    bucket.push({ event: safeEvent(row.event), status: text(row.status).toLowerCase(), timestampMs, evidenceRefs: (Array.isArray(row.evidenceRefs) ? row.evidenceRefs : []).map(publicEvidenceRef).filter((value): value is string => Boolean(value)), order: index + 1 });
    eventsByAgent.set(id, bucket);
  });
  const skippedRows = skipped.map((agent, index) => {
    const value = agent as Record<string, unknown>;
    const selectionReason = safeReasonCode(value.reason, "SCOPED_PLAN_NOT_SELECTED");
    return { id: text(value.id), name: text(value.id), team: "", role: "", status: "SKIPPED" as const, sequence: null, timestamp: null, lastEvent: null, evidenceRefs: [], artifactRefs: [], artifactDetails: [], executionSummary: null, implementationHash: null, selectionReason, detail: `Not selected: ${selectionReason}.`, index };
  });
  const selectedRows = selected.map((agent, index) => {
    const value = agent as Record<string, unknown>;
    const id = text(value.id);
    const events = (eventsByAgent.get(id) || []).sort((a, b) => a.timestampMs - b.timestampMs || a.order - b.order);
    const last = events.at(-1);
    const status = last?.status === "failed" ? "FAILED" as const : last?.status === "blocked" ? "BLOCKED" as const : events.length ? "DRY_RUN_OBSERVED" as const : "PLANNED" as const;
    const selectionReason = selectedReasons.get(id) ?? "SCOPED_WORKFLOW_DEPENDENCY";
    return {
      id, name: text(value.name, id), team: text(value.team), role: text(value.role), status,
      sequence: last?.order ?? null, timestamp: last ? new Date(last.timestampMs).toISOString() : null,
      lastEvent: last?.event ?? null, evidenceRefs: Array.from(new Set(events.flatMap(event => event.evidenceRefs))), artifactRefs: [], artifactDetails: [], executionSummary: null, implementationHash: null,
      selectionReason,
      detail: status === "PLANNED" ? "Selected in the dry-run plan; no execution trace event was retained." : "Observed in a dry-run supervisor trace; this is not evidence of autonomous production execution.", index,
    };
  });
  const agents = [...selectedRows, ...skippedRows].sort((a, b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.index - b.index).map(({ index: _index, ...agent }) => agent);
  return {
    tuple: { projectId: input.projectId, conversationId: input.conversationId, buildRunId: input.buildRunId }, registryCount: CANONICAL_AGENT_COUNT, executionMode: "dry-run",
    totals: { selected: selected.length, skipped: skipped.length, planned: selectedRows.filter(agent => agent.status === "PLANNED").length, traceObserved: selectedRows.filter(agent => agent.status === "DRY_RUN_OBSERVED").length, running: 0, succeeded: 0, blocked: selectedRows.filter(agent => agent.status === "BLOCKED").length, failed: selectedRows.filter(agent => agent.status === "FAILED").length },
    trace: { file: /^[a-zA-Z0-9_-]+\.jsonl$/.test(traceFile) ? `evidence/agent-traces/${traceFile}` : null, present: rows.length > 0, eventCount: rows.length }, agents,
  };
}
import { CANONICAL_AGENT_COUNT } from "./agentOrchestrator";
