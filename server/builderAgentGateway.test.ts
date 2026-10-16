import { describe, expect, it } from "vitest";
import { BUILDER_AGENT_ID, builderAgentSystemInstruction, createBuilderAgentDispatch } from "./builderAgentGateway";

describe("builder agent gateway", () => {
  it("refuses to create new implementation dispatches", () => {
    expect(() => createBuilderAgentDispatch({ request: "Update the project." })).toThrow("BUILD_EXECUTION_DISABLED");
    expect(() => createBuilderAgentDispatch({ request: "Update saved work.", sourceBuildRunId: "run-123" })).toThrow("BUILD_EXECUTION_DISABLED");
  });

  it("prevents the conversation model from promising implementation work", () => {
    expect(builderAgentSystemInstruction()).toContain("Project implementation is disabled");
    expect(builderAgentSystemInstruction()).toContain("Never invoke an implementation agent");
    expect(builderAgentSystemInstruction()).toContain("Saved project files are read-only");
  });
});
