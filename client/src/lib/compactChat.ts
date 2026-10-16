export type CompactChatContent = { content: string; codeHidden: boolean };
const MAX_CHAT_RESPONSE_LENGTH = 1200;

export const EXPLICIT_CODE_REQUEST = /(?:اعرض\s*(?:لي\s*)?(?:الكود|كود)|show\s+(?:me\s+)?(?:the\s+)?code|display\s+(?:the\s+)?code)/i;

const CODE_LINE = /^\s*(?:<\/?[a-z][^>]*>|import\s|export\s|const\s|let\s|function\s|class\s|interface\s|type\s|[.#][\w-]+\s*\{|[\w-]+\s*:\s*[^;]+;|return\s|\/\/)/i;

export function compactAssistantMessageForChat(content: string, codeRequested: boolean): CompactChatContent {
  if (codeRequested) return { content, codeHidden: false };
  const fencedBlocks = content.match(/```[\s\S]*?(?:```|$)/g) ?? [];
  const hasLongFencedCode = fencedBlocks.some(block => block.length > 280);
  const lines = content.split("\n");
  const codeLineCount = lines.filter(line => CODE_LINE.test(line)).length;
  const hasLongInlineCode = content.length > 720 && codeLineCount >= 6;
  if (!hasLongFencedCode && !hasLongInlineCode && content.length <= MAX_CHAT_RESPONSE_LENGTH) {
    return { content, codeHidden: false };
  }

  const withoutLongFences = content.replace(/```[\s\S]*?(?:```|$)/g, block => block.length > 140 ? "" : block);
  const compactProse = hasLongInlineCode
    ? withoutLongFences.split("\n").filter(line => !CODE_LINE.test(line)).join("\n").trim()
    : withoutLongFences.trim();
  const boundedProse = compactProse.length > MAX_CHAT_RESPONSE_LENGTH
    ? `${compactProse.slice(0, MAX_CHAT_RESPONSE_LENGTH).trimEnd()}…`
    : compactProse;
  return {
    content: boundedProse || "The response included implementation details that are intentionally kept out of compact chat.",
    codeHidden: true,
  };
}

export function priorUserAskedForCode(messages: Array<{ role: string; content: string }>, assistantIndex: number) {
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return EXPLICIT_CODE_REQUEST.test(messages[index].content);
  }
  return false;
}
