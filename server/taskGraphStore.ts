import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildInitialTaskGraph, transitionTask, type TaskGraph } from "./taskGraph";

const graphs = new Map<string, TaskGraph>();
/** Local-folder events intentionally use a user-global workspace scope until a desktop-selected project id exists. */
export const LOCAL_WORKSPACE_SCOPE = { projectId: 0, conversationId: 0 } as const;
export type TaskGraphEvent = { type: "plan.created" | "generation.verified" | "preview.verified" | "preview.blocked" | "qa.verified" | "local.bound" | "local.rebound" | "local.unbound" | "checkpoint.saved"; at: number; evidence: string };
export type ProjectMemoryEntry = { kind: string; payload: Record<string, unknown>; createdAt: number };
const events = new Map<string, TaskGraphEvent[]>();
const projectMemoryRoot = path.join(process.cwd(), ".workspace-memory");

function key(userId: number, projectId: number, conversationId: number) {
  return `${userId}:${projectId}:${conversationId}`;
}

function memoryFilePath(userId: number, projectId: number, conversationId: number) {
  return path.join(projectMemoryRoot, String(userId), String(projectId), "code-memory.json");
}

async function loadProjectMemoryEntries(userId: number, projectId: number, conversationId: number): Promise<ProjectMemoryEntry[]> {
  const target = memoryFilePath(userId, projectId, conversationId);
  try {
    const serialized = await readFile(target, "utf8");
    const parsed = JSON.parse(serialized) as { entries?: ProjectMemoryEntry[] } | null;
    if (Array.isArray(parsed?.entries)) return parsed.entries.filter((entry): entry is ProjectMemoryEntry => typeof entry?.kind === "string" && !!entry.payload && typeof entry.createdAt === "number");
  } catch {
    // Missing or stale workspace memory is treated as empty so generation can begin with the existing project state only.
  }
  return [];
}

async function writeProjectMemoryEntries(userId: number, projectId: number, conversationId: number, entries: ProjectMemoryEntry[]) {
  const target = memoryFilePath(userId, projectId, conversationId);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify({ entries }, null, 2));
}

export async function appendProjectMemory(userId: number, projectId: number, conversationId: number, kind: string, payload: Record<string, unknown>) {
  const entries = await loadProjectMemoryEntries(userId, projectId, conversationId);
  const safePayload = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : { value: payload };
  const serialized = JSON.stringify({ kind, payload: safePayload });
  if (/(api[_-]?key|authorization|bearer\s+|password)/i.test(serialized)) {
    throw new Error("SECRET_MATERIAL_NOT_ALLOWED_IN_MEMORY");
  }
  const next = [...entries.slice(-99), { kind, payload: safePayload, createdAt: Date.now() }];
  await writeProjectMemoryEntries(userId, projectId, conversationId, next);
  return next[next.length - 1];
}

export async function listProjectMemory(userId: number, projectId: number, conversationId: number) {
  return loadProjectMemoryEntries(userId, projectId, conversationId);
}

export async function clearProjectMemory(userId: number, projectId: number, conversationId: number) {
  await writeProjectMemoryEntries(userId, projectId, conversationId, []);
}

export async function getProjectMemoryContext(userId: number, projectId: number, conversationId: number) {
  const entries = await listProjectMemory(userId, projectId, conversationId);
  if (!entries.length) return "";
  const summary = entries
    .slice(-8)
    .map(entry => `- ${entry.kind}: ${JSON.stringify(entry.payload).slice(0, 220)}`)
    .join("\n");
  return `Project memory (code-only, project-scoped; never mixed into chat):\n${summary}`;
}

export function savePlan(userId: number, projectId: number, conversationId: number, goal: string) {
  const scope = key(userId, projectId, conversationId);
  const evidence = "Plan endpoint accepted and stored for this workspace conversation.";
  const graph = transitionTask(buildInitialTaskGraph(goal), "plan", "Verified", evidence);
  graphs.set(scope, graph);
  recordEvent(userId, projectId, conversationId, "plan.created", evidence);
  return graph;
}

export function getPlan(userId: number, projectId: number, conversationId: number) {
  return graphs.get(key(userId, projectId, conversationId));
}

export function markGenerated(userId: number, projectId: number, conversationId: number, evidence: string) {
  const graph = getPlan(userId, projectId, conversationId);
  if (!graph) return undefined;
  const scope = key(userId, projectId, conversationId);
  const next = transitionTask(graph, "generate", "Verified", evidence);
  graphs.set(scope, next);
  recordEvent(userId, projectId, conversationId, "generation.verified", evidence);
  return next;
}

export function recordEvent(userId: number, projectId: number, conversationId: number, type: TaskGraphEvent["type"], evidence: string) {
  const scope = key(userId, projectId, conversationId);
  const prior = events.get(scope) || [];
  const hasPlan = prior.some(event => event.type === "plan.created");
  const hasGeneration = prior.some(event => event.type === "generation.verified");
  const hasPreview = prior.some(event => event.type === "preview.verified");
  if ((type === "generation.verified" || type === "preview.verified" || type === "preview.blocked" || type === "qa.verified" || type === "checkpoint.saved") && !hasPlan) return undefined;
  if ((type === "preview.verified" || type === "preview.blocked" || type === "qa.verified") && !hasGeneration) return undefined;
  if (type === "qa.verified" && !hasPreview) return undefined;
  if ((type === "checkpoint.saved" && !hasPreview) || (type === "checkpoint.saved" && !prior.some(event => event.type === "qa.verified"))) return undefined;
  if (type === "local.unbound" && !prior.some(event => event.type === "local.bound" || event.type === "local.rebound")) return undefined;
  const event = { type, at: Date.now(), evidence } satisfies TaskGraphEvent;
  events.set(scope, [...prior, event]);
  return event;
}

function markTask(userId: number, projectId: number, conversationId: number, taskId: "preview" | "test" | "checkpoint", eventType: "preview.verified" | "qa.verified" | "checkpoint.saved", evidence: string) {
  const graph = getPlan(userId, projectId, conversationId);
  if (!graph) return undefined;
  const event = recordEvent(userId, projectId, conversationId, eventType, evidence);
  if (!event) return undefined;
  const next = transitionTask(graph, taskId, "Verified", evidence);
  graphs.set(key(userId, projectId, conversationId), next);
  return next;
}

export function markPreview(userId: number, projectId: number, conversationId: number, evidence: string) {
  return markTask(userId, projectId, conversationId, "preview", "preview.verified", evidence);
}

export function markPreviewBlocked(userId: number, projectId: number, conversationId: number, evidence: string) {
  const graph = getPlan(userId, projectId, conversationId);
  if (!graph) return undefined;
  const event = recordEvent(userId, projectId, conversationId, "preview.blocked", evidence);
  if (!event) return undefined;
  const next = transitionTask(graph, "preview", "Blocked", evidence);
  graphs.set(key(userId, projectId, conversationId), next);
  return next;
}

export function markTested(userId: number, projectId: number, conversationId: number, evidence: string) {
  return markTask(userId, projectId, conversationId, "test", "qa.verified", evidence);
}

export function markCheckpoint(userId: number, projectId: number, conversationId: number, evidence: string) {
  return markTask(userId, projectId, conversationId, "checkpoint", "checkpoint.saved", evidence);
}

export function listEvents(userId: number, projectId: number, conversationId: number) {
  return [...(events.get(key(userId, projectId, conversationId)) || [])];
}

export function clearPlans() {
  graphs.clear();
  events.clear();
}
