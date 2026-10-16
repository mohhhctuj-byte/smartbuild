import { describe, expect, it } from "vitest";
import { agentExecutionEvidencePath } from "./agentExecutionEvidencePath";

describe("agentExecutionEvidencePath", () => {
  it("uses a Windows-safe stable filename for run-scoped task identifiers", () => {
    expect(agentExecutionEvidencePath("f60b261e-c787-44ec-8423-e221dbd16f92:agent_003"))
      .toBe("evidence/agent-executions/f60b261e-c787-44ec-8423-e221dbd16f92_agent_003.json");
  });

  it("preserves already-safe task identifiers", () => {
    expect(agentExecutionEvidencePath("task-003")).toBe("evidence/agent-executions/task-003.json");
  });

  it("rejects path separators and unsafe task identifiers", () => {
    expect(() => agentExecutionEvidencePath("../outside")).toThrow("AGENT_TASK_IDENTIFIER_INVALID");
  });
});
