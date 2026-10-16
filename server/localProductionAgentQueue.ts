import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DurableAgentTaskScope } from "./db";
import { deriveProductionAgentQueuePlan } from "./productionAgentQueue";
import { runOneProductionAgentTask } from "./productionAgentTaskWorker";
import type { ProductionAgentQueueHooks, ProductionAgentTaskRecord } from "./productionAgentBuildLifecycle";
import type { AgentOrchestrationSummary } from "./agentOrchestrator";
import { agentExecutionEvidencePath } from "./agentExecutionEvidencePath";

type LocalTask = ProductionAgentTaskRecord & { leaseToken?: string };
type LocalQueueSnapshot = DurableAgentTaskScope & {
  format: "smartbuild-local-agent-queue-v1";
  workspaceRoot: string | null;
  tasks: LocalTask[];
  artifactPaths: string[];
};

const DEFAULT_STATE_ROOT = path.join(process.cwd(), ".smartbuild-local-state", "agent-queues");
const DEFAULT_WORKSPACE_ROOT = path.resolve(process.env.SMARTBUILD_WORKSPACE_ROOT || path.join(process.cwd(), ".smartbuild-cloud-workspaces"));
const validBuildId = /^[A-Za-z0-9-]{1,100}$/;
const snapshotWriteLocks = new Map<string, Promise<void>>();
const safeProjectPath = (value: string) =>
  /^(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) &&
  !value.split("/").some(part => part.startsWith(".") || part === "node_modules") &&
  !value.split("/").some(part => /^\.env(?:\.|$)/.test(part));

function statePath(root: string, scope: DurableAgentTaskScope) {
  if (!Number.isSafeInteger(scope.userId) || scope.userId < 1 ||
      !Number.isSafeInteger(scope.projectId) || scope.projectId < 1 ||
      !Number.isSafeInteger(scope.conversationId) || scope.conversationId < 1 ||
      !validBuildId.test(scope.buildRunId)) throw new Error("LOCAL_AGENT_QUEUE_SCOPE_INVALID");
  return path.join(root, `user-${scope.userId}`, `build-${scope.buildRunId}.json`);
}

function matchesScope(snapshot: LocalQueueSnapshot, scope: DurableAgentTaskScope) {
  return snapshot.userId === scope.userId &&
    snapshot.projectId === scope.projectId &&
    snapshot.conversationId === scope.conversationId &&
    snapshot.buildRunId === scope.buildRunId;
}

function isLocalTask(value: unknown): value is LocalTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.taskId === "string" &&
    typeof item.agentId === "string" &&
    Number.isSafeInteger(item.executionOrder) &&
    ["planned", "running", "succeeded", "blocked", "failed", "cancelled"].includes(String(item.status)) &&
    typeof item.implementationHash === "string" &&
    Array.isArray(item.outputArtifactRefs) &&
    Array.isArray(item.evidenceRefs) &&
    Array.isArray(item.logs);
}

function parseSnapshot(value: unknown, scope: DurableAgentTaskScope): LocalQueueSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LOCAL_AGENT_QUEUE_STATE_INVALID");
  const item = value as Partial<LocalQueueSnapshot>;
  if (
    item.format !== "smartbuild-local-agent-queue-v1" ||
    !matchesScope(item as LocalQueueSnapshot, scope) ||
    !Array.isArray(item.tasks) ||
    !item.tasks.every(isLocalTask) ||
    !Array.isArray(item.artifactPaths) ||
    !item.artifactPaths.every(file => typeof file === "string" && safeProjectPath(file)) ||
    !(item.workspaceRoot === null || typeof item.workspaceRoot === "string")
  ) throw new Error("LOCAL_AGENT_QUEUE_STATE_INVALID");
  return item as LocalQueueSnapshot;
}

async function readSnapshot(root: string, scope: DurableAgentTaskScope): Promise<LocalQueueSnapshot | null> {
  const filename = statePath(root, scope);
  try {
    return parseSnapshot(JSON.parse(await readFile(filename, "utf8")), scope);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeSnapshot(root: string, snapshot: LocalQueueSnapshot) {
  const filename = statePath(root, snapshot);
  const previous = snapshotWriteLocks.get(filename) || Promise.resolve();
  const current = previous.then(async () => {
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, JSON.stringify(snapshot), "utf8");
  });
  snapshotWriteLocks.set(filename, current);
  try {
    await current;
  } finally {
    if (snapshotWriteLocks.get(filename) === current) snapshotWriteLocks.delete(filename);
  }
}

function newSnapshot(scope: DurableAgentTaskScope): LocalQueueSnapshot {
  return { ...scope, format: "smartbuild-local-agent-queue-v1", workspaceRoot: null, tasks: [], artifactPaths: [] };
}

export function createLocalProductionAgentQueueHooks(stateRoot = DEFAULT_STATE_ROOT): ProductionAgentQueueHooks {
  return {
    async seed({ scope, orchestration }: { scope: DurableAgentTaskScope; orchestration: AgentOrchestrationSummary }) {
      const plan = deriveProductionAgentQueuePlan(orchestration);
      const current = await readSnapshot(stateRoot, scope);
      if (current) return current.tasks.map(({ leaseToken: _leaseToken, ...task }) => task);
      const snapshot = newSnapshot(scope);
      snapshot.tasks = plan.tasks.map((task, index) => ({
        taskId: task.taskId,
        agentId: task.agentId,
        executionOrder: index + 1,
        status: "planned",
        implementationHash: plan.seeds[index]!.implementationHash,
        outputArtifactRefs: [],
        evidenceRefs: [],
        logs: [],
      }));
      await writeSnapshot(stateRoot, snapshot);
      return snapshot.tasks.map(({ leaseToken: _leaseToken, ...task }) => task);
    },
    async list(scope: DurableAgentTaskScope) {
      const snapshot = await readSnapshot(stateRoot, scope);
      return (snapshot?.tasks || []).map(({ leaseToken: _leaseToken, ...task }) => task);
    },
    async runOne(input) {
      const workerResult = await runOneProductionAgentTask(input, {
        claim: async (scope, leaseToken, leaseDurationMs) => {
          const snapshot = await readSnapshot(stateRoot, scope);
          if (!snapshot) throw new Error("LOCAL_AGENT_QUEUE_STATE_MISSING");
          const stale = snapshot.tasks.find(task => task.status === "running");
          if (stale) {
            const startedAt = Date.parse(String(stale.startedAt || ""));
            if (Number.isFinite(startedAt) && Date.now() - startedAt < leaseDurationMs) return undefined;
            stale.status = "planned";
            delete stale.leaseToken;
          }
          const task = snapshot.tasks.find(candidate =>
            candidate.status === "planned" &&
            snapshot.tasks.filter(previous => previous.executionOrder < candidate.executionOrder).every(previous => previous.status === "succeeded"));
          if (!task) return undefined;
          task.status = "running";
          task.leaseToken = leaseToken;
          task.startedAt = new Date().toISOString();
          await writeSnapshot(stateRoot, snapshot);
          return { taskId: task.taskId, agentId: task.agentId };
        },
        renew: async (scope, taskId, leaseToken) => {
          const snapshot = await readSnapshot(stateRoot, scope);
          const task = snapshot?.tasks.find(candidate => candidate.taskId === taskId);
          if (!snapshot || !task || task.status !== "running" || task.leaseToken !== leaseToken) return false;
          task.startedAt = new Date().toISOString();
          await writeSnapshot(stateRoot, snapshot);
          return true;
        },
        complete: async (scope, taskId, leaseToken, result) => {
          const snapshot = await readSnapshot(stateRoot, scope);
          const task = snapshot?.tasks.find(candidate => candidate.taskId === taskId);
          if (!snapshot || !task || task.leaseToken !== leaseToken) return false;
          task.status = result.status;
          task.outputArtifactRefs = [...(result.outputArtifactRefs || [])];
          task.evidenceRefs = [...(result.evidenceRefs || [])];
          task.blockedReason = result.blockedReason;
          task.logs = [...(result.logs || [])];
          task.completedAt = new Date().toISOString();
          delete task.leaseToken;
          await writeSnapshot(stateRoot, snapshot);
          return true;
        },
        persist: async (workerInput, files) => {
          const snapshot = await readSnapshot(stateRoot, workerInput.scope);
          if (!snapshot) throw new Error("LOCAL_AGENT_QUEUE_STATE_MISSING");
          const workspaceRoot = path.resolve(workerInput.workspaceRoot);
          if (!workspaceRoot.startsWith(`${DEFAULT_WORKSPACE_ROOT}${path.sep}`)) throw new Error("LOCAL_AGENT_WORKSPACE_SCOPE_INVALID");
          for (const file of files) {
            if (!safeProjectPath(file.path)) throw new Error("LOCAL_AGENT_ARTIFACT_PATH_INVALID");
            const target = path.resolve(workspaceRoot, file.path);
            if (!target.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error("LOCAL_AGENT_ARTIFACT_PATH_INVALID");
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, file.content, "utf8");
            if (!snapshot.artifactPaths.includes(file.path)) snapshot.artifactPaths.push(file.path);
          }
          snapshot.workspaceRoot = workspaceRoot;
          await writeSnapshot(stateRoot, snapshot);
          return files.map(file => file.path);
        },
        persistEvidence: async (workerInput, task, outcome) => {
          const evidencePath = agentExecutionEvidencePath(task.taskId);
          if (!safeProjectPath(evidencePath)) throw new Error("LOCAL_AGENT_EVIDENCE_PATH_INVALID");
          const workspaceRoot = path.resolve(workerInput.workspaceRoot);
          if (!workspaceRoot.startsWith(`${DEFAULT_WORKSPACE_ROOT}${path.sep}`)) throw new Error("LOCAL_AGENT_WORKSPACE_SCOPE_INVALID");
          const target = path.resolve(workspaceRoot, evidencePath);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, JSON.stringify({
            format: "smartbuild-agent-execution-evidence-v1",
            buildRunId: workerInput.scope.buildRunId,
            projectId: workerInput.scope.projectId,
            conversationId: workerInput.scope.conversationId,
            taskId: task.taskId,
            agentId: task.agentId,
            status: outcome.status,
            summary: outcome.summary,
            verification: outcome.verification,
            blockedReason: outcome.blockedReason || null,
            artifactPaths: outcome.changedFiles.map(file => file.path),
            evidenceRefs: outcome.evidenceRefs,
          }, null, 2), "utf8");
          return [evidencePath];
        },
      });
      return workerResult;
    },
  };
}

export async function listLocalProductionAgentArtifacts(userId: number, buildRunId: string, stateRoot = DEFAULT_STATE_ROOT) {
  if (!Number.isSafeInteger(userId) || userId < 1 || !validBuildId.test(buildRunId)) throw new Error("LOCAL_AGENT_QUEUE_SCOPE_INVALID");
  const root = path.resolve(stateRoot);
  const filename = path.join(root, `user-${userId}`, `build-${buildRunId}.json`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("LOCAL_AGENT_QUEUE_STATE_INVALID");
  const snapshot = parsed as LocalQueueSnapshot;
  if (
    snapshot.format !== "smartbuild-local-agent-queue-v1" ||
    snapshot.userId !== userId ||
    snapshot.buildRunId !== buildRunId ||
    !Array.isArray(snapshot.artifactPaths) ||
    !snapshot.artifactPaths.every(file => typeof file === "string" && safeProjectPath(file))
  ) throw new Error("LOCAL_AGENT_QUEUE_STATE_INVALID");
  if (!snapshot.workspaceRoot) return [];
  const workspaceRoot = path.resolve(snapshot.workspaceRoot);
  if (!workspaceRoot.startsWith(`${DEFAULT_WORKSPACE_ROOT}${path.sep}`)) throw new Error("LOCAL_AGENT_WORKSPACE_SCOPE_INVALID");
  const discoveredPaths: string[] = [];
  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === "evidence" || entry.name === "agent-artifacts" || entry.name === "node_modules") continue;
        await visit(path.join(directory, entry.name), relativePath);
      } else if (entry.isFile() && safeProjectPath(relativePath)) {
        discoveredPaths.push(relativePath);
      }
    }
  };
  await visit(workspaceRoot, "");
  const artifactPaths = Array.from(new Set([...snapshot.artifactPaths, ...discoveredPaths])).filter(safeProjectPath);
  return Promise.all(artifactPaths.map(async relativePath => ({
    path: relativePath,
    content: await readFile(path.resolve(workspaceRoot, relativePath), "utf8"),
  })));
}

export async function removeLocalProductionAgentArtifact(scope: DurableAgentTaskScope, relativePath: string, stateRoot = DEFAULT_STATE_ROOT) {
  if (!safeProjectPath(relativePath)) throw new Error("LOCAL_AGENT_ARTIFACT_PATH_INVALID");
  const snapshot = await readSnapshot(stateRoot, scope);
  if (!snapshot) throw new Error("LOCAL_AGENT_QUEUE_STATE_MISSING");
  snapshot.artifactPaths = snapshot.artifactPaths.filter(file => file !== relativePath);
  await writeSnapshot(stateRoot, snapshot);
}

export const localProductionAgentQueueHooks = createLocalProductionAgentQueueHooks();
