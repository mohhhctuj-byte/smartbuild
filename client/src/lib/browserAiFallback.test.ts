import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BROWSER_LOCAL_CHAT_INSTRUCTIONS,
  clearPendingBrowserReplies,
  generateBrowserLocalReply,
  isRecoverableChatFailure,
  mergePendingBrowserReplies,
  prepareBrowserLocalModel,
  savePendingBrowserReply,
  type PromptApi,
} from "./browserAiFallback";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browser AI fallback", () => {
  it("includes proactive pronunciation guidance in the local assistant policy", () => {
    expect(BROWSER_LOCAL_CHAT_INSTRUCTIONS).toContain("include how to pronounce the target in the first answer without waiting for a follow-up");
    expect(BROWSER_LOCAL_CHAT_INSTRUCTIONS).toContain("distinguish the letter name from the sound it represents");
    expect(BROWSER_LOCAL_CHAT_INSTRUCTIONS).toContain("exactly one target letter alone in the first cell of each row");
    expect(BROWSER_LOCAL_CHAT_INSTRUCTIONS).toContain("include all 21 standard letters");
  });

  it("only falls back for network, timeout, 429, 5xx, or server-marked retryable failures", () => {
    expect(isRecoverableChatFailure({ status: 429 })).toBe(true);
    expect(isRecoverableChatFailure({ status: 503 })).toBe(true);
    expect(isRecoverableChatFailure({ error: new TypeError("Failed to fetch") })).toBe(true);
    expect(isRecoverableChatFailure({ error: Object.assign(new Error("Timed out"), { name: "TimeoutError" }) })).toBe(true);
    expect(isRecoverableChatFailure({ retryable: true })).toBe(true);
    expect(isRecoverableChatFailure({ status: 401 })).toBe(false);
    expect(isRecoverableChatFailure({ status: 400 })).toBe(false);
    expect(isRecoverableChatFailure({ error: Object.assign(new Error("Stopped"), { name: "AbortError" }) })).toBe(false);
  });

  it("uses the built-in Prompt API and releases its session", async () => {
    const destroy = vi.fn();
    const api: PromptApi = {
      availability: vi.fn().mockResolvedValue("available"),
      create: vi.fn().mockResolvedValue({ prompt: vi.fn().mockResolvedValue(" Réponse locale "), destroy }),
    };

    await expect(generateBrowserLocalReply([{ role: "user", content: "Bonjour" }], undefined, api))
      .resolves.toBe("Réponse locale");
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
      initialPrompts: [{ role: "user", content: "Bonjour" }],
    }));
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("does not create or download a model without user activation", async () => {
    const api: PromptApi = {
      availability: vi.fn().mockResolvedValue("downloadable"),
      create: vi.fn(),
    };

    await expect(generateBrowserLocalReply([{ role: "user", content: "Hello" }], undefined, api, false))
      .rejects.toThrow("Enable Prompt API");
    expect(api.create).not.toHaveBeenCalled();
  });

  it("downloads the local model only through an explicit activated action", async () => {
    const destroy = vi.fn();
    const api: PromptApi = {
      availability: vi.fn().mockResolvedValue("downloadable"),
      create: vi.fn().mockResolvedValue({ prompt: vi.fn(), destroy }),
    };
    const progress = vi.fn();

    await expect(prepareBrowserLocalModel(progress, api, true)).resolves.toBeUndefined();
    expect(api.create).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("returns unavailable when the browser has no Prompt API", async () => {
    await expect(generateBrowserLocalReply([{ role: "user", content: "Hello" }], undefined, null))
      .resolves.toBeNull();
  });

  it("restores a local-only user turn and assistant reply without duplicating server history", () => {
    savePendingBrowserReply(7, {
      userContent: "Help me",
      assistantContent: "Local answer",
      createdAt: "2026-10-14T00:00:00.000Z",
    });
    const restored = mergePendingBrowserReplies([{ id: 1, role: "user" as const, content: "Help me" }], 7);
    expect(restored.map(message => [message.role, message.content])).toEqual([
      ["user", "Help me"],
      ["assistant", "Local answer"],
    ]);
    expect(mergePendingBrowserReplies(restored, 7)).toHaveLength(2);

    clearPendingBrowserReplies(7);
    expect(mergePendingBrowserReplies([{ id: 1, role: "user" as const, content: "Help me" }], 7)).toHaveLength(1);
  });
});
