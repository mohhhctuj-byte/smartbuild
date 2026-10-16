import { describe, expect, it } from "vitest";
import { compactAssistantMessageForChat } from "@/lib/compactChat";

describe("compactAssistantMessageForChat", () => {
  const longCode = `Here is an implementation:\n\n\`\`\`tsx\n${Array.from({ length: 48 }, (_, index) => `export const line${index} = \"generated implementation\";`).join("\n")}\n\`\`\``;

  it("hides a long fenced implementation by default", () => {
    const result = compactAssistantMessageForChat(longCode, false);

    expect(result.codeHidden).toBe(true);
    expect(result.content).not.toContain("export const line0");
  });

  it("preserves code when the user explicitly asks to display it", () => {
    const result = compactAssistantMessageForChat(longCode, true);

    expect(result.codeHidden).toBe(false);
    expect(result.content).toContain("export const line0");
  });

  it("does not suppress an ordinary concise explanation", () => {
    const result = compactAssistantMessageForChat("The preview is unavailable because the selected Build Run has no durable preview artifact.", false);

    expect(result).toEqual({
      content: "The preview is unavailable because the selected Build Run has no durable preview artifact.",
      codeHidden: false,
    });
  });

  it("bounds long chat responses instead of rendering an unsolicited wall of text", () => {
    const result = compactAssistantMessageForChat("A".repeat(2000), false);

    expect(result.codeHidden).toBe(true);
    expect(result.content.length).toBeLessThanOrEqual(1201);
    expect(result.content.endsWith("…")).toBe(true);
  });
});
