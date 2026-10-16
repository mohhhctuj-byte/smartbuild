import { describe, expect, it } from "vitest";
import { canAutoTitleConversation, cleanGeneratedConversationTitle, cleanTitle, extractCodeBlocks, isUntitledProjectName, normaliseResearchQuery, preserveMarkdownHistory } from "./workspace";

describe("workspace helpers", () => {
  it("extracts code blocks and honours an annotated filename", () => {
    const result = extractCodeBlocks("```tsx\n// file: src/App.tsx\nexport default function App() { return null; }\n```");
    expect(result).toEqual([{ language: "tsx", path: "src/App.tsx", content: "// file: src/App.tsx\nexport default function App() { return null; }" }]);
  });

  it("keeps the final streamed code block when its closing fence is absent", () => {
    const result = extractCodeBlocks("Draft implementation:\n```html\n<!doctype html><title>SmartBuild</title>");
    expect(result).toEqual([{ language: "html", path: "generated/01.html", content: "<!doctype html><title>SmartBuild</title>" }]);
  });

  it("normalises user supplied workspace text", () => {
    expect(cleanTitle("  Build   dashboard  ")).toBe("Build dashboard");
    expect(normaliseResearchQuery("  vector   database  patterns ")).toBe("vector database patterns");
  });

  it("normalises generated conversation titles to two through four bare words", () => {
    expect(cleanGeneratedConversationTitle('  "Build a modern portfolio website"  ')).toBe("Build a modern portfolio");
    expect(cleanGeneratedConversationTitle("عنوان: تصميم متجر إلكتروني")).toBe("تصميم متجر إلكتروني");
    expect(cleanGeneratedConversationTitle("One")).toBeNull();
    expect(cleanGeneratedConversationTitle("```text\nBuild a dashboard\n```")).toBe("Build a dashboard");
  });

  it("auto-titles only an untouched conversation after its first user message has a reply", () => {
    expect(canAutoTitleConversation("New build", ["user", "assistant"])).toBe(true);
    expect(canAutoTitleConversation("New conversation", ["user", "assistant"])).toBe(true);
    expect(canAutoTitleConversation("My manually named chat", ["user", "assistant"])).toBe(false);
    expect(canAutoTitleConversation("New build", ["user"])).toBe(false);
    expect(canAutoTitleConversation("New build", ["user", "assistant", "user"])).toBe(false);
  });

  it("only auto-renames default project names, never a user-named workspace", () => {
    expect(isUntitledProjectName("Workspace 9")).toBe(true);
    expect(isUntitledProjectName("My workspace")).toBe(true);
    expect(isUntitledProjectName("Italian practice")).toBe(false);
  });

  it("preserves Markdown content while rejecting invalid history entries", () => {
    const history = preserveMarkdownHistory([{ role: "user", content: "Use `const x = 1`\n\n```ts\nexport const x = 1\n```" }, { role: "bad", content: "ignored" }]);
    expect(history).toEqual([{ role: "user", content: "Use `const x = 1`\n\n```ts\nexport const x = 1\n```" }]);
  });
});
