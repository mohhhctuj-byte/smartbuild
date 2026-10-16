export const WEBSITE_BUILDER_AGENT_ID = "smartbuild-website-builder-agent";
export const WEBSITE_BUILDER_AGENT_NAME = "Website Builder Agent";

export const WEBSITE_BUILDER_AGENT_STAGES = [
  "analyze",
  "implement",
  "preview",
  "test",
  "evaluate",
  "verify",
] as const;

export const WEBSITE_BUILDER_AGENT_MANDATE = [
  "Project implementation is disabled.",
  "Do not write or modify project files, invoke tools, or claim that work was completed.",
  "Saved project data must remain unchanged.",
].join(" ");

export function websiteBuilderAgentInstruction() {
  return WEBSITE_BUILDER_AGENT_MANDATE;
}
