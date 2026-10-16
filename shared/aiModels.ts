export const AI_MODEL_IDS = {
  smartbuild: "sm-plus-3.1-pro",
  claude: "anthropic-claude",
} as const;

export type AiModelId = (typeof AI_MODEL_IDS)[keyof typeof AI_MODEL_IDS];

export const ANTHROPIC_MODEL_ID = "claude-sonnet-5-5";
