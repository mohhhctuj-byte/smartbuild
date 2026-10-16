import { describe, expect, it, vi } from "vitest";
import { AI_MODEL_IDS } from "@shared/aiModels";
import { generateWorkspaceName, normalizeGeneratedWorkspaceName } from "./workspaceName";

describe("AI-generated workspace names", () => {
  it("asks the selected AI for a short title and validates its structured response", async () => {
    const generate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ name: "Accessly" }) } }],
    });
    await expect(generateWorkspaceName("Build a polished sign-in page", AI_MODEL_IDS.claude, generate)).resolves.toBe("Accessly");
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      model: AI_MODEL_IDS.claude,
      timeoutMs: 8_000,
      maxTokens: 64,
      outputSchema: expect.objectContaining({ name: "workspace_name" }),
    }));
  });

  it("rejects malformed, overly long, and generic fallback titles", () => {
    expect(() => normalizeGeneratedWorkspaceName("SmartBuild workspace")).toThrow(/outside the supported format/);
    expect(() => normalizeGeneratedWorkspaceName("دخول")).toThrow(/outside the supported format/);
    expect(() => normalizeGeneratedWorkspaceName("تسجيل دخول")).toThrow(/outside the supported format/);
    expect(() => normalizeGeneratedWorkspaceName("a".repeat(49))).toThrow(/outside the supported format/);
    expect(() => normalizeGeneratedWorkspaceName("Name\nwith line break")).toThrow(/outside the supported format/);
  });

  it("reports provider output errors rather than turning them into request text", async () => {
    const generate = vi.fn().mockResolvedValue({ choices: [{ message: { content: "not JSON" } }] });
    await expect(generateWorkspaceName("Build a login page", undefined, generate)).rejects.toThrow(/unreadable workspace name/);
  });
});
