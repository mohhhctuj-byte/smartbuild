export type AgentQueueStatus = "planned" | "running" | "succeeded" | "blocked" | "failed" | "cancelled";

export type AgentQueueSeed = {
  taskId: string;
  agentId: string;
  executionOrder: number;
  selectedReason: string;
  implementationHash: string;
};

export type AgentQueueRecord = Pick<AgentQueueSeed, "taskId" | "executionOrder"> & {
  status: AgentQueueStatus;
};

const SAFE_QUEUE_SELECTED_REASON_CODES = new Set([
  "REQUEST_CAPABILITY_MATCH",
  "SCOPED_WORKFLOW_DEPENDENCY",
]);

/**
 * Production execution is linear by design: the first selected agent is
 * assigned order 1, and a later agent never begins when an earlier agent is
 * still pending, running, blocked, failed, or cancelled.
 */
export function assertSequentialProductionAgentTaskPlan(tasks: readonly AgentQueueSeed[]) {
  if (!tasks.length) throw new Error("AGENT_TASK_PLAN_EMPTY");
  const taskIds = new Set<string>();
  const agentIds = new Set<string>();
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index]!;
    if (!task.taskId || !task.agentId || !task.selectedReason || !task.implementationHash) throw new Error("AGENT_TASK_PLAN_INVALID");
    if (!SAFE_QUEUE_SELECTED_REASON_CODES.has(task.selectedReason)) throw new Error("AGENT_TASK_PLAN_SELECTION_REASON_INVALID");
    if (task.executionOrder !== index + 1) throw new Error("AGENT_TASK_PLAN_ORDER_INVALID");
    if (taskIds.has(task.taskId) || agentIds.has(task.agentId)) throw new Error("AGENT_TASK_PLAN_DUPLICATE");
    taskIds.add(task.taskId);
    agentIds.add(task.agentId);
  }
}

export function nextSequentialProductionTaskId(tasks: readonly AgentQueueRecord[]) {
  const ordered = [...tasks].sort((left, right) => left.executionOrder - right.executionOrder);
  for (const task of ordered) {
    if (task.status === "succeeded") continue;
    return task.status === "planned" ? task.taskId : undefined;
  }
  return undefined;
}

export function taskPlanHasTerminalFailure(tasks: readonly Pick<AgentQueueRecord, "status">[]) {
  return tasks.some(task => task.status === "blocked" || task.status === "failed" || task.status === "cancelled");
}
