import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateTextWithFallback, generateWorkspaceConversationTitle } from "./llmStream";

const originalFetch = global.fetch;

function githubSuccess() {
  return new Response(
    'data: {"choices":[{"delta":{"content":"Fallback verified"}}]}\n\ndata: [DONE]\n\n',
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

describe("generateTextWithFallback provider-chain mocks", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries({
      AI_PROVIDER_ORDER: "gemini,groq,github",
      GEMINI_API_KEY: "mock-gemini-key",
      GEMINI_MODEL: "gemini-2.5-flash",
      GROQ_API_KEY: "mock-groq-key",
      GROQ_MODEL: "llama-3.3-70b-versatile",
      GITHUB_MODELS_API_KEY: "mock-github-key",
      GITHUB_MODELS_MODEL: "openai/gpt-4.1-mini",
      GITHUB_MODELS_BASE_URL: "https://models.github.ai/inference",
      GEMINI_API_KEYS: "",
      GEMINI_MODELS: "",
      GITHUB_TOKEN: "",
    })) {
      vi.stubEnv(key, value);
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("generates a concise same-language conversation title through the configured provider chain", async () => {
    process.env.AI_PROVIDER_ORDER = "groq";
    const titleStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"تصميم متجر إلكتروني"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(titleStream, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(generateWorkspaceConversationTitle("عايز أعمل متجر إلكتروني لبيع الملابس"))
      .resolves.toBe("تصميم متجر إلكتروني");
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.max_tokens).toBe(32);
    expect(requestBody.messages[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("2 to 4 words"),
    });
    expect(requestBody.messages[0].content).toContain("same language as that message");
    expect(requestBody.messages[0].content).toContain("only the bare title text");
    expect(requestBody.messages[1]).toEqual({
      role: "user",
      content: "عايز أعمل متجر إلكتروني لبيع الملابس",
    });
  });

  it.each([
    {
      name: "Gemini 429 and Groq 429",
      geminiFailure: "rate-limit" as const,
      groqFailure: "rate-limit" as const,
    },
    {
      name: "Gemini network error and Groq network error",
      geminiFailure: "network" as const,
      groqFailure: "network" as const,
    },
  ])("switches providers through GitHub Models after $name", async ({ name, geminiFailure, groqFailure }) => {
    const events: string[] = [];
    const geminiAttempts = 6;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("generativelanguage.googleapis.com")) {
        events.push("Gemini mocked failure");
        if (geminiFailure === "network") throw new TypeError("fetch failed");
        return new Response("", { status: 429 });
      }
      if (url === "https://api.groq.com/openai/v1/chat/completions") {
        events.push("Groq mocked failure");
        if (groqFailure === "network") throw new TypeError("fetch failed");
        return new Response("", { status: 429 });
      }
      if (url === "https://models.github.ai/inference/chat/completions") {
        events.push("GitHub Models mocked success");
        return githubSuccess();
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    const result = await generateTextWithFallback("Test the provider fallback chain.");

    expect(result).toBe("Fallback verified");
    expect(fetchMock).toHaveBeenCalledTimes(geminiFailure === "rate-limit" ? geminiAttempts + 2 : 3);
    const requestedUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestedUrls.slice(0, geminiFailure === "rate-limit" ? geminiAttempts : 1)
      .every(url => url.includes("generativelanguage.googleapis.com"))).toBe(true);
    expect(requestedUrls[geminiFailure === "rate-limit" ? geminiAttempts : 1])
      .toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(requestedUrls.at(-1)).toBe("https://models.github.ai/inference/chat/completions");
    expect(events.at(-1)).toBe("GitHub Models mocked success");

    console.info(
      `${name}: Gemini failed -> Switching to Groq -> Groq failed -> Switching to GitHub Models -> GitHub Models succeeded`,
    );
  });
});
