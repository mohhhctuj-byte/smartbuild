export type CodeBlock = {
  path: string;
  language: string;
  content: string;
};

export type WorkspaceMessage = { role: "system" | "user" | "assistant"; content: string };

const EXTENSIONS: Record<string, string> = {
  typescript: "ts",
  tsx: "tsx",
  javascript: "js",
  jsx: "jsx",
  python: "py",
  html: "html",
  css: "css",
  json: "json",
  sql: "sql",
  bash: "sh",
  shell: "sh",
  markdown: "md",
};

export function cleanTitle(input: string) {
  return input.trim().replace(/\s+/g, " ").slice(0, 72) || "New conversation";
}

export function cleanGeneratedConversationTitle(input: string) {
  const title = input
    .trim()
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/^(?:title|عنوان)\s*:\s*/i, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = title.split(" ").filter(Boolean);
  if (words.length < 2) return null;
  return words.slice(0, 4).join(" ").slice(0, 72) || null;
}

export function canAutoTitleConversation(title: string, messageRoles: string[]) {
  return ["New build", "New conversation"].includes(title)
    && messageRoles.filter(role => role === "user").length === 1
    && messageRoles.includes("assistant");
}

export function isUntitledProjectName(name: string) {
  return name === "My workspace" || /^Workspace \d+$/.test(name);
}

export function normaliseResearchQuery(input: unknown) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/\s+/g, " ").slice(0, 240);
}

export function preserveMarkdownHistory(input: unknown): WorkspaceMessage[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { role?: unknown; content?: unknown };
    if (!["system", "user", "assistant"].includes(String(candidate.role)) || typeof candidate.content !== "string") return [];
    return [{ role: candidate.role as WorkspaceMessage["role"], content: candidate.content.slice(0, 50_000) }];
  }).slice(-20);
}

export function extractCodeBlocks(markdown: string): CodeBlock[] {
  // Streaming providers can finish after the code content but before emitting the
  // closing fence. Treat only the final open fence as a recoverable code block;
  // complete fences continue to be parsed independently by the global matcher.
  const blocks = Array.from(markdown.matchAll(/```([\w+-]+)?\n([\s\S]*?)(?:```|$)/g));
  return blocks.slice(0, 20).flatMap((match, index) => {
    const language = (match[1] || "text").toLowerCase();
    const rawContent = match[2].trim();
    if (!rawContent) return [];
    const filenameMatch = rawContent.match(/^(?:\/\/|#|\/\*)\s*(?:file|filename|path)\s*:\s*([^\n*]+)\n/i);
    const namedPath = filenameMatch?.[1]?.trim().replace(/^['"`]|['"`]$/g, "");
    const extension = EXTENSIONS[language] || "txt";
    return [{
      language,
      path: namedPath || `generated/${String(index + 1).padStart(2, "0")}.${extension}`,
      content: rawContent,
    }];
  });
}
