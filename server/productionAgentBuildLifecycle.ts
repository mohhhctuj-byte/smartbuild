import type { AgentOrchestrationSummary } from "./agentOrchestrator";
import type { ProductionAgentTask } from "./agentProductionExecutor";
import { type DurableAgentTaskScope, listDurableBuildRunAgentTasks, seedDurableBuildRunAgentTasks } from "./db";
import { deriveProductionAgentQueuePlan } from "./productionAgentQueue";
import { runOneProductionAgentTask, type ProductionAgentWorkerResult } from "./productionAgentTaskWorker";

export type ProductionAgentTaskRecord = {
  taskId: string;
  agentId: string;
  executionOrder: number;
  status: "planned" | "running" | "succeeded" | "blocked" | "failed" | "cancelled";
  implementationHash: string;
  outputArtifactRefs: string[];
  evidenceRefs: string[];
  logs: string[];
  blockedReason?: string;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
};

export type ProductionAgentQueueScope = DurableAgentTaskScope;

export type ProductionAgentQueueHooks = {
  seed: (input: { scope: ProductionAgentQueueScope; orchestration: AgentOrchestrationSummary }) => Promise<readonly ProductionAgentTaskRecord[]>;
  list: (scope: ProductionAgentQueueScope) => Promise<readonly ProductionAgentTaskRecord[]>;
  runOne: (input: {
    scope: ProductionAgentQueueScope;
    model?: string;
    requirement: string;
    workspaceRoot: string;
    knownFiles: readonly string[];
    tasks: readonly ProductionAgentTask[];
  }) => Promise<ProductionAgentWorkerResult>;
};

const asStrings = (value: unknown) => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

export function filterProductionAgentTaskRecords<T extends {
  userId: number;
  projectId: number;
  conversationId: number;
  buildRunId: string;
  executionMode: string;
}>(records: readonly T[], scope: ProductionAgentQueueScope): readonly T[] {
  return records.filter(record =>
    record.userId === scope.userId &&
    record.projectId === scope.projectId &&
    record.conversationId === scope.conversationId &&
    record.buildRunId === scope.buildRunId &&
    record.executionMode === "production",
  );
}

function normalizeTaskRecord(record: Awaited<ReturnType<typeof listDurableBuildRunAgentTasks>>[number]): ProductionAgentTaskRecord {
  return {
    taskId: record.taskId,
    agentId: record.agentId,
    executionOrder: record.executionOrder,
    status: record.status,
    implementationHash: record.implementationHash || "implementation-hash-unavailable",
    outputArtifactRefs: asStrings(record.outputArtifactRefs),
    evidenceRefs: asStrings(record.evidenceRefs),
    logs: asStrings(record.logs),
    blockedReason: record.blockedReason || undefined,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
  };
}

/**
 * The default adapter is deliberately small: the queue is the source of truth
 * and every invocation claims and executes at most one selected task. The
 * planner's dry-run output is used solely to select and order work.
 */
export const durableProductionAgentQueueHooks: ProductionAgentQueueHooks = {
  async seed({ scope, orchestration }) {
    const plan = deriveProductionAgentQueuePlan(orchestration);
    const records = await seedDurableBuildRunAgentTasks(scope, plan.seeds);
    return records.map(normalizeTaskRecord);
  },
  async list(scope) {
    const records = await listDurableBuildRunAgentTasks(scope.userId, scope.buildRunId);
    return filterProductionAgentTaskRecords(records, scope).map(normalizeTaskRecord);
  },
  async runOne(input) {
    return runOneProductionAgentTask({
      scope: input.scope,
      ...(input.model ? { model: input.model } : {}),
      requirement: input.requirement,
      workspaceRoot: input.workspaceRoot,
      knownFiles: input.knownFiles,
      tasks: input.tasks,
    });
  },
};
