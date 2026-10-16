export type BrowserPromptMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type PendingBrowserReply = {
  userContent: string;
  assistantContent: string;
  createdAt: string;
};

type PromptSession = {
  prompt(input: string): Promise<string>;
  destroy?: () => void;
};

export type PromptApi = {
  availability(): Promise<string>;
  create(options: {
    initialPrompts: BrowserPromptMessage[];
    signal?: AbortSignal;
    monitor?: (monitor: {
      addEventListener(type: "downloadprogress", listener: (event: Event & { loaded?: number }) => void): void;
    }) => void;
  }): Promise<PromptSession>;
};

const PENDING_REPLY_KEY_PREFIX = "smartbuild:browser-ai-replies:";
export const BROWSER_LOCAL_CHAT_INSTRUCTIONS = "You are SmartBuild, a professional multilingual assistant. Reply in the same language as the user's latest message. Be clear and helpful. You can answer questions and help with software, writing, analysis, and other tasks, but do not claim to perform actions you cannot perform. When the user asks about a word, letter, spelling, translation, or language learning, include how to pronounce the target in the first answer without waiting for a follow-up: give an easy phonetic guide in the user's language/script and IPA when useful, with syllable breaks and stress for non-obvious pronunciations. When asked for the Italian alphabet, include all 21 standard letters (A, B, C, D, E, F, G, H, I, L, M, N, O, P, Q, R, S, T, U, V, Z) and optionally list J, K, W, X, Y separately as letters mainly used in loanwords. For requests to hear individual letters, use a Markdown table with exactly one target letter alone in the first cell of each row; put Arabic transliteration and explanations in other cells so the interface can place a dedicated audio button beside each letter. For letters, distinguish the letter name from the sound it represents. Keep pronunciation guidance concise and omit it for unrelated requests.";

export function isRecoverableChatFailure(input: { status?: number; retryable?: boolean; error?: unknown }) {
  if (input.retryable === true) return true;
  if (input.status === 429 || (typeof input.status === "number" && input.status >= 500 && input.status <= 599)) return true;

  const error = input.error;
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return false;
  if (error.name === "TimeoutError") return true;
  return error instanceof TypeError
    && /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(error.message);
}

function browserPromptApi(): PromptApi | undefined {
  return (globalThis as typeof globalThis & { LanguageModel?: PromptApi }).LanguageModel;
}

function hasUserActivation() {
  return typeof navigator !== "undefined"
    && Boolean((navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive);
}

export async function generateBrowserLocalReply(
  messages: BrowserPromptMessage[],
  signal?: AbortSignal,
  api: PromptApi | null | undefined = browserPromptApi(),
  userActivation?: boolean,
  onDownloadProgress?: (loadedPercent: number) => void,
) {
  if (!api) return null;

  const availability = await api.availability();
  if (availability === "unavailable") return null;
  if (availability !== "available" && !(userActivation ?? hasUserActivation())) {
    throw new Error("Chrome's local AI model is not downloaded. Enable Prompt API and download its model in Chrome, then try again.");
  }

  const session = await api.create({
    initialPrompts: messages,
    signal,
    monitor: monitor => monitor.addEventListener("downloadprogress", event => {
      if (typeof event.loaded === "number") onDownloadProgress?.(Math.round(event.loaded * 100));
    }),
  });

  try {
    const answer = (await session.prompt("Answer the latest user message. Reply in the same language as that message.")).trim();
    return answer || null;
  } finally {
    session.destroy?.();
  }
}

export async function prepareBrowserLocalModel(
  onDownloadProgress?: (loadedPercent: number) => void,
  api: PromptApi | null | undefined = browserPromptApi(),
  userActivation = hasUserActivation(),
) {
  if (!api) throw new Error("Chrome's Prompt API is not available in this browser.");
  const availability = await api.availability();
  if (availability === "unavailable") throw new Error("Chrome's Prompt API is unavailable on this device.");
  if (availability === "available") return;
  if (!userActivation) throw new Error("Click Prepare local AI to start Chrome's model download.");

  const session = await api.create({
    initialPrompts: [{ role: "system", content: "You are SmartBuild's local AI assistant." }],
    monitor: monitor => monitor.addEventListener("downloadprogress", event => {
      if (typeof event.loaded === "number") onDownloadProgress?.(Math.round(event.loaded * 100));
    }),
  });
  session.destroy?.();
}

export function savePendingBrowserReply(conversationId: number, reply: PendingBrowserReply) {
  const key = `${PENDING_REPLY_KEY_PREFIX}${conversationId}`;
  const current = JSON.parse(localStorage.getItem(key) || "[]") as PendingBrowserReply[];
  localStorage.setItem(key, JSON.stringify([...current, reply]));
}

export function clearPendingBrowserReplies(conversationId: number) {
  localStorage.removeItem(`${PENDING_REPLY_KEY_PREFIX}${conversationId}`);
}

export function mergePendingBrowserReplies<T extends { id: string | number; role: "user" | "assistant" | "system"; content: string }>(
  messages: T[],
  conversationId: number,
) {
  const pending = JSON.parse(localStorage.getItem(`${PENDING_REPLY_KEY_PREFIX}${conversationId}`) || "[]") as PendingBrowserReply[];
  const merged: Array<T | { id: string; role: "user" | "assistant"; content: string }> = [...messages];

  for (let index = 0; index < pending.length; index += 1) {
    const reply = pending[index]!;
    let userIndex = -1;
    for (let cursor = merged.length - 1; cursor >= 0; cursor -= 1) {
      if (merged[cursor]?.role === "user" && merged[cursor]?.content === reply.userContent) {
        userIndex = cursor;
        break;
      }
    }
    if (userIndex < 0) {
      merged.push({ id: `browser-user-${reply.createdAt}-${index}`, role: "user", content: reply.userContent });
      userIndex = merged.length - 1;
    }

    const existingAssistant = merged.slice(userIndex + 1).some(message =>
      message.role === "assistant" && message.content === reply.assistantContent,
    );
    if (!existingAssistant) {
      merged.splice(userIndex + 1, 0, {
        id: `browser-assistant-${reply.createdAt}-${index}`,
        role: "assistant",
        content: reply.assistantContent,
      });
    }
  }

  return merged;
}
