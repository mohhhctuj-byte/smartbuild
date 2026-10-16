import { describe, expect, it } from "vitest";
import { workspaceAssistantInstructions, workspaceCapabilityInstructions } from "./aiResponsePolicy";
import { attachedAgentBrain } from "./agentBrain";

describe("workspaceAssistantInstructions", () => {
  it("uses the supplied agent brain as its shared system policy", () => {
    const instructions = workspaceAssistantInstructions();

    expect(instructions).toContain(attachedAgentBrain);
    expect(instructions).toContain("SmartBuild chat-mode contract");
    expect(instructions).toContain("Avoid exposing private information, credentials, or internal reasoning.");
    expect(instructions).toContain("Settings → Secrets");
    expect(instructions).toContain("Never claim that saving a key connects or validates a provider.");
    expect(instructions).toContain("Always reply in the language used in the user's latest message");
    expect(instructions).toContain("including Arabic, English, French, and other languages");
    expect(instructions).toContain("include how to pronounce the target in the first answer without waiting for a follow-up");
    expect(instructions).toContain("distinguish the letter name from the sound it represents");
    expect(instructions).toContain("Use a Markdown table with one target letter by itself in the first cell of each row");
    expect(instructions).toContain("Do not put Arabic transliteration or explanation in the target-letter cell");
    expect(instructions).toContain("include all 21 standard letters");
    expect(instructions).not.toContain("{{user_message}}");
  });

  it("keeps chat text-only and does not claim tracked work without backend confirmation", () => {
    const instructions = workspaceAssistantInstructions();

    expect(instructions).toContain("conversational guidance only");
    expect(instructions).toContain("cannot apply project changes");
    expect(instructions).toContain("Treat saved project files and records as read-only");
    expect(instructions).toContain("not a website-building-only assistant");
    expect(instructions).toContain("writing and editing");
    expect(instructions).toContain("everyday questions");
    expect(instructions).toContain("not a fixed or exhaustive menu");
  });

  it("keeps backend journey state authoritative rather than model-generated", () => {
    expect(workspaceAssistantInstructions()).toContain("Request journey state is controlled by verified application/backend state");
  });

  it("formats the runtime capability snapshot as authoritative context", () => {
    const context = workspaceCapabilityInstructions({
      frontend: { available: true, detail: "Preview is available." },
      payments: { available: false, detail: "No provider credentials are configured." },
    });
    expect(context).toContain("frontend: AVAILABLE");
    expect(context).toContain("payments: UNAVAILABLE");
    expect(context).toContain("never invent a service");
  });
});
