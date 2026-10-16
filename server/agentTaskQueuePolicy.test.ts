import { describe, expect, it } from "vitest";
import { assertSequentialProductionAgentTaskPlan, nextSequentialProductionTaskId, taskPlanHasTerminalFailure } from "./agentTaskQueuePolicy";

const seed = (executionOrder: number, agentId = `agent_${executionOrder}`) => ({
  taskId: `task_${executionOrder}`,
  agentId,
  executionOrder,
  selectedReason: "REQUEST_CAPABILITY_MATCH",
  implementationHash: `sha256-${executionOrder}`,
});

describe("production agent task queue policy", () => {
  it("accepts one ordered, uniquely assigned production plan", () => {
    expect(() => assertSequentialProductionAgentTaskPlan([seed(1), seed(2), seed(3)])).not.toThrow();
  });

  it("rejects gaps, duplicate agents, and incomplete execution identity", () => {
    expect(() => assertSequentialProductionAgentTaskPlan([seed(1), seed(3)])).toThrow("AGENT_TASK_PLAN_ORDER_INVALID");
    expect(() => assertSequentialProductionAgentTaskPlan([seed(1, "agent_x"), seed(2, "agent_x")])).toThrow("AGENT_TASK_PLAN_DUPLICATE");
    expect(() => assertSequentialProductionAgentTaskPlan([{ ...seed(1), implementationHash: "" }])).toThrow("AGENT_TASK_PLAN_INVALID");
    expect(() => assertSequentialProductionAgentTaskPlan([{ ...seed(1), selectedReason: "selected because request contains a secret-like phrase" }])).toThrow("AGENT_TASK_PLAN_SELECTION_REASON_INVALID");
  });

  it("releases only the earliest pending task and never advances after a terminal result", () => {
    expect(nextSequentialProductionTaskId([
      { taskId: "task_1", executionOrder: 1, status: "succeeded" },
      { taskId: "task_2", executionOrder: 2, status: "planned" },
      { taskId: "task_3", executionOrder: 3, status: "planned" },
    ])).toBe("task_2");
    expect(nextSequentialProductionTaskId([
      { taskId: "task_1", executionOrder: 1, status: "failed" },
      { taskId: "task_2", executionOrder: 2, status: "planned" },
    ])).toBeUndefined();
    expect(taskPlanHasTerminalFailure([{ status: "succeeded" }, { status: "blocked" }])).toBe(true);
  });
});
