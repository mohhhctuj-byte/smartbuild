import {
  WEBSITE_BUILDER_AGENT_ID,
  WEBSITE_BUILDER_AGENT_NAME,
  WEBSITE_BUILDER_AGENT_STAGES,
} from "./websiteBuilderAgent";

export const BUILDER_AGENT_ID = WEBSITE_BUILDER_AGENT_ID;

export type BuilderAgentAction = "build" | "iterate";

export type BuilderAgentDispatch = {
  agentId: typeof BUILDER_AGENT_ID;
  agentName: typeof WEBSITE_BUILDER_AGENT_NAME;
  action: BuilderAgentAction;
  request: string;
  sourceBuildRunId?: string;
  executionMode: "production-agent-queue";
  modelProfile: "deep_reasoning";
  requiredStages: typeof WEBSITE_BUILDER_AGENT_STAGES;
  delegationMessage: string;
};

export function createBuilderAgentDispatch(input: {
  request: string;
  sourceBuildRunId?: string;
}): BuilderAgentDispatch {
  void input;
  throw new Error("BUILD_EXECUTION_DISABLED");
}

export function builderAgentSystemInstruction() {
  return [
    "Project implementation is disabled.",
    "Never invoke an implementation agent or claim project changes happened.",
    "Saved project files are read-only.",
  ].join(" ");
}
