import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeGeminiMedia, analyzeOllamaVisionMedia, generateTextWithFallback, getAiProviderFailureMessage, invokeGeminiStructured, invokeWorkspaceLLMStream, invokeWorkspaceLLMStructured, isFreeGeminiModel, listGeminiModels, shouldFallbackToBrowser, verifyGeminiProvider, verifyOllamaProvider, verifyOllamaVisionProvider } from "./llmStream";
import { AI_MODEL_IDS, ANTHROPIC_MODEL_ID } from "@shared/aiModels";

describe("browser fallback eligibility", () => {
  it("allows network, timeout, and rate-limit/server failures only", () => {
    expect(shouldFallbackToBrowser(new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldFallbackToBrowser(Object.assign(new Error("Request timed out"), { name: "TimeoutError" }))).toBe(true);
    expect(shouldFallbackToBrowser(new Error("Provider failed with status 429"))).toBe(true);
    expect(shouldFallbackToBrowser(new Error("GEMINI_STRUCTURED_HTTP_503"))).toBe(true);
    expect(shouldFallbackToBrowser(new Error("NOT_CONFIGURED"))).toBe(false);
    expect(shouldFallbackToBrowser(new Error("Provider returned invalid JSON"))).toBe(false);
    expect(shouldFallbackToBrowser(Object.assign(new Error("Request cancelled"), { name: "AbortError" }))).toBe(false);
  });
});

describe("invokeWorkspaceLLMStream", () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.BUILT_IN_FORGE_API_URL;
  const originalKey = process.env.BUILT_IN_FORGE_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGeminiKeys = process.env.GEMINI_API_KEYS;
  const originalGeminiModel = process.env.GEMINI_MODEL;
  const originalGroqApiKey = process.env.GROQ_API_KEY;
  const originalGroqModel = process.env.GROQ_MODEL;
  const originalGithubModelsApiKey = process.env.GITHUB_MODELS_API_KEY;
  const originalGithubToken = process.env.GITHUB_TOKEN;
  const originalGithubModelsModel = process.env.GITHUB_MODELS_MODEL;
  const originalGithubModelsBaseUrl = process.env.GITHUB_MODELS_BASE_URL;
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const originalOllamaEnvironment = Object.fromEntries(
    ["AI_PROVIDER_ORDER", "OLLAMA_BASE_URL", "OLLAMA_MODEL", "OLLAMA_BUILD_MODEL", "OLLAMA_MEDIA_MODEL", "FFMPEG_PATH", "OLLAMA_TIMEOUT_MS", "OLLAMA_MAX_TOKENS", "OLLAMA_BUILD_MAX_TOKENS", "OLLAMA_KEEP_ALIVE"]
      .map(name => [name, process.env[name]]),
  );

  beforeEach(() => {
    process.env.AI_PROVIDER_ORDER = "gemini,manus";
    delete process.env.OLLAMA_MAX_TOKENS;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env.BUILT_IN_FORGE_API_URL = originalUrl;
    process.env.BUILT_IN_FORGE_API_KEY = originalKey;
    process.env.GEMINI_API_KEY = originalGeminiKey;
    process.env.GEMINI_API_KEYS = originalGeminiKeys;
    process.env.GEMINI_MODEL = originalGeminiModel;
    process.env.GROQ_API_KEY = originalGroqApiKey;
    process.env.GROQ_MODEL = originalGroqModel;
    process.env.GITHUB_MODELS_API_KEY = originalGithubModelsApiKey;
    process.env.GITHUB_TOKEN = originalGithubToken;
    process.env.GITHUB_MODELS_MODEL = originalGithubModelsModel;
    process.env.GITHUB_MODELS_BASE_URL = originalGithubModelsBaseUrl;
    if (originalAnthropicApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    for (const [name, value] of Object.entries(originalOllamaEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("streams actual Ollama NDJSON using the configured chat model", async () => {
    process.env.AI_PROVIDER_ORDER = "ollama";
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    process.env.OLLAMA_MODEL = "qwen2.5:3b";
    process.env.OLLAMA_BUILD_MODEL = "qwen2.5:7b";
    process.env.OLLAMA_KEEP_ALIVE = "5m";
    const encoder = new TextEncoder();
    const payload = '{"message":{"content":"Hello "},"done":false}\n{"message":{"content":"from Ollama"},"done":true}\n';
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(encoder.encode(payload.slice(0, 29)));
      controller.enqueue(encoder.encode(payload.slice(29)));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream({ messages: [{ role: "user", content: "Hi" }], maxTokens: 4096 }, token => tokens.push(token));

    expect(tokens.join("")).toBe("Hello from Ollama");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://ollama.test/api/chat");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "qwen2.5:3b",
      messages: [{ role: "user", content: "Hi" }],
      stream: true,
      keep_alive: "5m",
      options: { num_predict: 4096 },
    });
  });

  it("defaults chat to Gemini without trying a local provider", async () => {
    delete process.env.AI_PROVIDER_ORDER;
    process.env.GEMINI_API_KEY = "unit-test-gemini-key";
    delete process.env.GEMINI_MODEL;
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"Gemini reply"}]}}]}\n\n'));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    const tokens: string[] = [];
    await invokeWorkspaceLLMStream({ messages: [{ role: "user", content: "Hi" }], maxTokens: 4096 }, token => tokens.push(token));

    expect(tokens.join("")).toBe("Gemini reply");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-goog-api-key")).toBe("unit-test-gemini-key");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("unit-test-gemini-key");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).generationConfig.maxOutputTokens).toBe(4096);
  });

  it("routes an explicit Claude selection directly to the server-side Anthropic API", async () => {
    process.env.ANTHROPIC_API_KEY = "unit-test-anthropic-key";
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude reply"}}\n\n'));
      controller.enqueue(new TextEncoder().encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream({
      model: AI_MODEL_IDS.claude,
      messages: [
        { role: "system", content: "System instructions" },
        { role: "user", content: "Make the homepage dark." },
        { role: "assistant", content: "I will use a dark palette." },
        { role: "user", content: "Now add a pricing page." },
      ],
      maxTokens: 120,
    }, token => tokens.push(token));

    expect(tokens.join("")).toBe("Claude reply");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.anthropic.com/v1/messages");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-api-key": "unit-test-anthropic-key",
      "anthropic-version": "2023-06-01",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: ANTHROPIC_MODEL_ID,
      system: expect.stringContaining("System instructions"),
      messages: [
        { role: "user", content: "Make the homepage dark." },
        { role: "assistant", content: "I will use a dark palette." },
        { role: "user", content: "Now add a pricing page." },
      ],
      stream: true,
      max_tokens: 120,
    });
    const claudeRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(claudeRequest.system).toContain("Chat cannot change project files");
    expect(claudeRequest.system).not.toContain("For website build tasks, follow the verified implementation contract");
  });

  it("sends image blocks to Claude using Anthropic's base64 image content format", async () => {
    process.env.ANTHROPIC_API_KEY = "unit-test-anthropic-key";
    const images = Array.from({ length: 12 }, (_, index) => ({
      type: "image" as const,
      mimeType: index % 2 ? "image/jpeg" : "image/png",
      data: `base64-image-${index + 1}`,
      name: `image-${index + 1}`,
    }));
    const numberedImages = images.flatMap((image, index) => [
      { type: "text" as const, text: `Image ${index + 1} of 12.` },
      image,
    ]);
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"I can see the image."}}\n\n'));
      controller.enqueue(new TextEncoder().encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await invokeWorkspaceLLMStream({
      model: AI_MODEL_IDS.claude,
      messages: [{ role: "user", content: [
        { type: "text", text: "Inspect all 12 images." },
        ...numberedImages,
      ] }],
      maxTokens: 120,
    }, () => {});

    const content = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).messages[0].content;
    expect(content).toHaveLength(25);
    expect(content.filter((part: { type: string }) => part.type === "image")).toEqual(images.map(image => ({
      type: "image",
      source: { type: "base64", media_type: image.mimeType, data: image.data },
    })));
    expect(content.filter((part: { type: string; text?: string }) => part.type === "text" && part.text?.startsWith("Image ")).map((part: { text: string }) => part.text))
      .toEqual(Array.from({ length: 12 }, (_, index) => `Image ${index + 1} of 12.`));
  });

  it("sends image blocks to SM+3.1 Pro's Gemini provider as inline image data", async () => {
    process.env.GEMINI_API_KEY = "unit-test-gemini-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    const images = Array.from({ length: 12 }, (_, index) => ({
      type: "image" as const,
      mimeType: index % 2 ? "image/jpeg" : "image/png",
      data: `base64-image-${index + 1}`,
      name: `image-${index + 1}`,
    }));
    const numberedImages = images.flatMap((image, index) => [
      { type: "text" as const, text: `Image ${index + 1} of 12.` },
      image,
    ]);
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"I can see the image."}]}}]}\n\n'));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await invokeWorkspaceLLMStream({
      model: AI_MODEL_IDS.smartbuild,
      messages: [{ role: "user", content: [
        { type: "text", text: "Inspect all 12 images." },
        ...numberedImages,
      ] }],
      maxTokens: 120,
    }, () => {});

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const parts = requestBody.contents[0].parts;
    expect(parts).toHaveLength(25);
    expect(parts.filter((part: { inlineData?: unknown }) => part.inlineData)).toEqual(images.map(image => ({
      inlineData: { mimeType: image.mimeType, data: image.data },
    })));
    expect(parts.filter((part: { text?: string }) => part.text?.startsWith("Image ")).map((part: { text: string }) => part.text))
      .toEqual(Array.from({ length: 12 }, (_, index) => `Image ${index + 1} of 12.`));
  });

  it("sends image blocks to the configured OpenAI-compatible SM provider", async () => {
    process.env.AI_PROVIDER_ORDER = "manus";
    delete process.env.GEMINI_API_KEY;
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example";
    process.env.BUILT_IN_FORGE_API_KEY = "unit-test-forge-key";
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"I can see the image."}}]}\n\n'));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await invokeWorkspaceLLMStream({
      model: AI_MODEL_IDS.smartbuild,
      messages: [{ role: "user", content: [
        { type: "text", text: "Describe this image." },
        { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=", name: "image.png" },
      ] }],
      maxTokens: 120,
    }, () => {});

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.messages.at(-1).content).toEqual([
      { type: "text", text: "Describe this image." },
      { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
    ]);
  });

  it("does not silently fall back when Claude is selected without a configured server key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    await expect(invokeWorkspaceLLMStream({
      model: AI_MODEL_IDS.claude,
      messages: [{ role: "user", content: "Hello" }],
      maxTokens: 30,
    }, () => {})).rejects.toThrow("ANTHROPIC_API_KEY_NOT_CONFIGURED");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the explicitly selected Anthropic provider for structured build-agent calls", async () => {
    process.env.ANTHROPIC_API_KEY = "unit-test-anthropic-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "msg_test",
      content: [{ type: "text", text: "{\"files\":[]}" }],
    }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    const result = await invokeWorkspaceLLMStructured({
      model: AI_MODEL_IDS.claude,
      messages: [{ role: "system", content: "Build agent" }, { role: "user", content: "Produce JSON" }],
      outputSchema: { name: "test", schema: { type: "object", properties: { files: { type: "array" } } } },
    });

    expect(result.model).toBe(ANTHROPIC_MODEL_ID);
    expect(result.choices[0]?.message.content).toBe("{\"files\":[]}");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.anthropic.com/v1/messages");
    expect(request.system).toContain("Build agent");
    expect(request.system).toContain("matching this schema");
  });

  it.each([
    ["Anthropic stream failed with status 429.", "Claude hit an Anthropic API usage limit."],
    ["Anthropic structured request failed with status 402.", "billing or spend limit"],
    ["ANTHROPIC_STREAM_OVERLOADED_ERROR", "Claude is temporarily unavailable."],
    ["Anthropic stream failed with status 529.", "Claude is temporarily unavailable."],
  ])("explains Claude usage and availability errors to the user", (detail, expected) => {
    expect(getAiProviderFailureMessage(new Error(detail))).toContain(expected);
    expect(getAiProviderFailureMessage(new Error(detail))).toContain("conversation is still here.");
  });

  it("does not fall back from Gemini when Gemini credentials are missing", async () => {
    process.env.AI_PROVIDER_ORDER = "gemini,ollama,manus";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEYS;
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    process.env.OLLAMA_MODEL = "qwen2.5:3b";
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    await expect(invokeWorkspaceLLMStream(
      { messages: [{ role: "user", content: "Hi" }], maxTokens: 32 },
      () => {},
    )).rejects.toThrow("GEMINI_API_KEY is not configured.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the configured Ollama build model for the SM agent", async () => {
    process.env.AI_PROVIDER_ORDER = "ollama";
    process.env.OLLAMA_MODEL = "qwen2.5:3b";
    process.env.OLLAMA_BUILD_MODEL = "qwen2.5:7b";
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"message":{"content":"Ready"},"done":true}\n'));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await invokeWorkspaceLLMStream({ messages: [{ role: "user", content: "Build a page" }], maxTokens: 30, model: "sm-plus-3.1-pro" }, () => {});

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "qwen2.5:7b",
      messages: [{ role: "system" }, { role: "user", content: "Build a page" }],
    });
  });

  it("preserves an Ollama failure when Ollama is the only configured provider", async () => {
    process.env.AI_PROVIDER_ORDER = "ollama";
    process.env.OLLAMA_MODEL = "qwen2.5:3b";
    process.env.GEMINI_API_KEY = "must-not-be-used";
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(invokeWorkspaceLLMStream({ messages: [{ role: "user", content: "Hi" }], maxTokens: 20 }, () => {}))
      .rejects.toThrow("Ollama stream failed with status 503.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports Ollama ready only when configured models are installed", async () => {
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    process.env.OLLAMA_MODEL = "qwen2.5:3b";
    process.env.OLLAMA_BUILD_MODEL = "qwen2.5:7b";
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      models: [{ name: "qwen2.5:3b" }, { name: "qwen2.5:7b" }],
    }), { status: 200 }));

    const result = await verifyOllamaProvider(request);

    expect(result).toEqual({ state: "Ready", reason: "Ollama is reachable and has the configured models installed." });
    expect(request.mock.calls[0]?.[0]).toBe("http://ollama.test/api/tags");
  });

  it("routes structured production-agent requests through the configured Ollama build model", async () => {
    process.env.AI_PROVIDER_ORDER = "ollama";
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    process.env.OLLAMA_BUILD_MODEL = "qwen2.5:7b";
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      '{"message":{"content":"{\\"summary\\":\\"saved\\",\\"files\\":[],\\"checks\\":[],\\"blockers\\":[]}"},"done":true}\n',
      { status: 200 },
    ));
    global.fetch = fetchMock as typeof fetch;
    const schema = { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] };

    const result = await invokeWorkspaceLLMStructured({
      model: "smartbuild-local-production-agent",
      maxTokens: 6000,
      outputSchema: { name: "agent", schema },
      messages: [{ role: "system", content: "Return JSON." }, { role: "user", content: "Build the feature." }],
    });

    expect(result.model).toBe("qwen2.5:7b");
    expect(result.choices[0]?.message.content).toContain('"summary":"saved"');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://ollama.test/api/chat");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "qwen2.5:7b",
      stream: true,
      format: schema,
      options: { num_predict: 1200, temperature: 0 },
    });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.messages[0].content).toContain("Return one JSON value with this required structure");
    expect(requestBody.messages[0].content).toContain('{"summary":"<string>"}');
  });

  it("does not fall back from Gemini for structured production-agent requests", async () => {
    process.env.AI_PROVIDER_ORDER = "gemini,ollama";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEYS;
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    process.env.OLLAMA_BUILD_MODEL = "qwen2.5:7b";
    const fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;

    await expect(invokeWorkspaceLLMStructured({
      model: "smartbuild-local-production-agent",
      maxTokens: 6000,
      outputSchema: { name: "agent", schema: { type: "object", properties: { summary: { type: "string" } } } },
      messages: [{ role: "user", content: "Build the feature." }],
    })).rejects.toThrow("GEMINI_API_KEY is not configured.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes reasoning settings to Manus and emits content tokens from SSE", async () => {
    process.env.AI_PROVIDER_ORDER = "manus";
    delete process.env.GEMINI_API_KEY;
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example";
    process.env.BUILT_IN_FORGE_API_KEY = "test-key";
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"builder"}}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream({ messages: [{ role: "user", content: "Hi" }], maxTokens: 120, reasoning: { effort: "low" } }, token => { tokens.push(token); });

    expect(tokens.join("")).toBe("Hello builder");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ stream: true, reasoning: { effort: "low" }, max_tokens: 120 });
  });

  it("uses the configured Gemini model server-side without exposing the key to the request body", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_MODEL = "gemini-3.1-flash-lite";
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n'));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream({ messages: [{ role: "user", content: "Hi" }], maxTokens: 120 }, token => { tokens.push(token); });

    expect(tokens.join("")).toBe("Hello");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("gemini-3.1-flash-lite");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).not.toContain("test-gemini-key");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });

  it("tries another Gemini model when a provider returns an empty stream", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    const emptyBody = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[]}}]}\n\n'));
      controller.close();
    } });
    const goodBody = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"Recovered reply"}]}}]}\n\n'));
      controller.close();
    } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(emptyBody, { status: 200 }))
      .mockResolvedValueOnce(new Response(goodBody, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream({ messages: [{ role: "user", content: "Hi" }], maxTokens: 32 }, token => tokens.push(token));

    expect(tokens.join("")).toBe("Recovered reply");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("gemini-2.5-flash");
    expect(fetchMock.mock.calls[1]?.[0]).not.toBe(fetchMock.mock.calls[0]?.[0]);
  });

  it("does not retry a Gemini response blocked by safety policy", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n'));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(invokeWorkspaceLLMStream({ messages: [{ role: "user", content: "Hi" }], maxTokens: 32 }, () => {}))
      .rejects.toThrow("Gemini response blocked: SAFETY.");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getAiProviderFailureMessage(new Error("Gemini response blocked: SAFETY."))).toContain("safety rules");
  });

  it("gives a retryable message when all Gemini model attempts return no text", () => {
    expect(getAiProviderFailureMessage(new Error("Gemini stream returned no text for model gemini-2.5-flash.")))
      .toBe("The AI service did not return a reply. Your message is saved; try again. If this keeps happening, check the provider's model configuration.");
  });

  it("rotates to the next server-side key after a quota response", async () => {
    process.env.GEMINI_API_KEYS = "first-key,second-key";
    delete process.env.GEMINI_API_KEY;
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"fallback"}]}}]}\n\n'));
      controller.close();
    } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream({ messages: [{ role: "user", content: "Hi" }], maxTokens: 20 }, token => tokens.push(token));

    expect(tokens.join("")).toBe("fallback");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-goog-api-key")).toBe("first-key");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("x-goog-api-key")).toBe("second-key");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("first-key");
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain("second-key");
  });

  it("preserves Gemini quota failures when no fallback provider is configured", async () => {
    process.env.GEMINI_API_KEY = "quota-key";
    delete process.env.GEMINI_API_KEYS;
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(invokeWorkspaceLLMStream({
      messages: [{ role: "user", content: "Hi" }],
      maxTokens: 20,
    }, () => {})).rejects.toThrow("Gemini stream failed with status 429.");
    expect(getAiProviderFailureMessage(new Error("Gemini stream failed with status 429."))).toContain("over quota");
  });

  it("falls back from Gemini network failure through Groq rate limits to GitHub Models", async () => {
    process.env.AI_PROVIDER_ORDER = "gemini,groq,github";
    process.env.GEMINI_API_KEY = "gemini-server-key";
    process.env.GROQ_API_KEY = "groq-server-key";
    process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
    process.env.GITHUB_MODELS_API_KEY = "github-server-key";
    process.env.GITHUB_MODELS_MODEL = "openai/gpt-4.1-mini";
    const githubStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"GitHub fallback reply"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response(githubStream, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream(
      { messages: [{ role: "user", content: "Write a short greeting." }], maxTokens: 40 },
      token => tokens.push(token),
    );

    expect(tokens.join("")).toBe("GitHub fallback reply");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("generativelanguage.googleapis.com");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe("https://models.github.ai/inference/chat/completions");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).model).toBe("llama-3.3-70b-versatile");
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)).model).toBe("openai/gpt-4.1-mini");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("authorization")).toBe("Bearer groq-server-key");
    expect(new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get("authorization")).toBe("Bearer github-server-key");
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("server-key"))).toBe(true);
  });

  it("reads a JSON message response from GitHub Models after earlier providers fail", async () => {
    process.env.AI_PROVIDER_ORDER = "gemini,groq,github";
    process.env.GEMINI_API_KEY = "gemini-server-key";
    process.env.GROQ_API_KEY = "groq-server-key";
    process.env.GITHUB_MODELS_API_KEY = "github-server-key";
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "GitHub JSON response" } }],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream(
      { messages: [{ role: "user", content: "Reply." }], maxTokens: 24 },
      token => tokens.push(token),
    );

    expect(tokens.join("")).toBe("GitHub JSON response");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not send the unsupported reasoning option to Groq", async () => {
    process.env.AI_PROVIDER_ORDER = "groq";
    process.env.GROQ_API_KEY = "groq-server-key";
    const groqStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Groq reply"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(groqStream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream({
      messages: [{ role: "user", content: "Reply." }],
      maxTokens: 24,
      reasoning: { effort: "low" },
    }, token => tokens.push(token));

    expect(tokens.join("")).toBe("Groq reply");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty("reasoning");
  });

  it("rejects a non-JSON GitHub Models success body rather than treating it as a model reply", async () => {
    process.env.AI_PROVIDER_ORDER = "github";
    process.env.GITHUB_MODELS_API_KEY = "github-server-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response("OK\r\n", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }));
    global.fetch = fetchMock as typeof fetch;

    await expect(invokeWorkspaceLLMStream(
      { messages: [{ role: "user", content: "Reply." }], maxTokens: 24 },
      () => {},
    )).rejects.toThrow("GitHub Models returned an unsupported response content type.");
  });

  it("does not switch providers after any answer text was already streamed", async () => {
    process.env.AI_PROVIDER_ORDER = "gemini,groq,github";
    process.env.GEMINI_API_KEY = "gemini-server-key";
    process.env.GROQ_API_KEY = "groq-server-key";
    const partialGeminiStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"Partial "}]}}]}\n\n'));
        setTimeout(() => controller.error(new TypeError("network connection lost")), 10);
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(partialGeminiStream, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await expect(invokeWorkspaceLLMStream(
      { messages: [{ role: "user", content: "Reply." }], maxTokens: 20 },
      token => tokens.push(token),
    )).rejects.toThrow();

    expect(tokens).toEqual(["Partial "]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("falls back to Groq for structured requests after a Gemini network failure", async () => {
    process.env.AI_PROVIDER_ORDER = "gemini,groq,github";
    process.env.GEMINI_API_KEY = "gemini-server-key";
    process.env.GROQ_API_KEY = "groq-server-key";
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "groq-response",
        model: "qwen/qwen3.8-27b",
        choices: [{ message: { role: "assistant", content: "{\"ok\":true}" }, finish_reason: "stop" }],
      }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    const result = await invokeWorkspaceLLMStructured({
      messages: [{ role: "user", content: "Return ok true." }],
      outputSchema: { name: "result", schema: { type: "object", properties: { ok: { type: "boolean" } } } },
    });

    expect(result.model).toBe("qwen/qwen3.8-27b");
    expect(result.choices[0]?.message.content).toBe("{\"ok\":true}");
    const requestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(requestBody).toMatchObject({
      model: "qwen/qwen3.8-27b",
      response_format: { type: "json_object" },
    });
    expect(requestBody.messages[0].content).toContain('"ok":{"type":"boolean"}');
  });

  it("falls back to Groq after all configured Gemini models are rate-limited", async () => {
    process.env.AI_PROVIDER_ORDER = "gemini,groq,github";
    process.env.GEMINI_API_KEY = "gemini-server-key";
    process.env.GROQ_API_KEY = "groq-server-key";
    const groqStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Groq fallback reply"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetchMock = vi.fn();
    for (let index = 0; index < 6; index += 1) {
      fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }));
    }
    fetchMock.mockResolvedValueOnce(new Response(groqStream, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream(
      { messages: [{ role: "user", content: "Write a greeting." }], maxTokens: 24 },
      token => tokens.push(token),
    );

    expect(tokens.join("")).toBe("Groq fallback reply");
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(String(fetchMock.mock.calls[6]?.[0])).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("accepts a plain prompt and returns text from the first available fallback", async () => {
    process.env.AI_PROVIDER_ORDER = "gemini,groq,github";
    process.env.GEMINI_API_KEY = "gemini-server-key";
    process.env.GROQ_API_KEY = "groq-server-key";
    const groqStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Text result"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(groqStream, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(generateTextWithFallback("Write a short greeting.")).resolves.toBe("Text result");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).messages).toEqual([
      { role: "user", content: "Write a short greeting." },
    ]);
    await expect(generateTextWithFallback("   ")).rejects.toThrow("PROMPT_REQUIRED");
  });

  it("does not fall back to the built-in provider after Gemini rejects a request", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.GEMINI_API_KEYS;
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example";
    process.env.BUILT_IN_FORGE_API_KEY = "test-key";
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 403 })));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await expect(invokeWorkspaceLLMStream(
      { messages: [{ role: "user", content: "Hi" }], maxTokens: 20 },
      token => tokens.push(token),
    )).rejects.toThrow("Gemini stream failed with status 403.");

    expect(tokens).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("generativelanguage.googleapis.com"))).toBe(true);
  });

  it("returns a clear diagnostic for missing provider configuration", () => {
    expect(getAiProviderFailureMessage(new Error("No AI provider is configured."))).toContain("No AI provider is configured");
    expect(getAiProviderFailureMessage(new Error("Gemini stream failed with status 401."))).toContain("rejected its credentials");
    expect(getAiProviderFailureMessage(new Error("fetch failed"))).toContain("could not connect");
  });

  it("reports a Gemini authentication rejection without exposing configured keys", async () => {
    process.env.GEMINI_API_KEY = "invalid-test-secret";
    delete process.env.GEMINI_API_KEYS;
    const result = await verifyGeminiProvider(vi.fn().mockResolvedValue(new Response("", { status: 401 })));

    expect(result).toEqual({ state: "Blocked", reason: "Gemini rejected the configured API key (HTTP 401)." });
    expect(JSON.stringify(result)).not.toContain("invalid-test-secret");
  });

  it("reports Gemini ready only when its API lists a configured generation model", async () => {
    process.env.GEMINI_API_KEY = "valid-test-secret";
    delete process.env.GEMINI_API_KEYS;
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }],
    }), { status: 200 }));

    const result = await verifyGeminiProvider(request);

    expect(result).toEqual({ state: "Ready", model: "gemini-2.5-flash", reason: "Gemini accepted the server key and lists gemini-2.5-flash for generation." });
    expect(JSON.stringify(result)).not.toContain("valid-test-secret");
  });

  it("rotates to the next free model after a quota response", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.GEMINI_API_KEYS;
    process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";
    process.env.GEMINI_MODELS = "gemini-2.5-flash-lite,gemini-2.5-flash";
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"model fallback"}]}}]}\n\n'));
      controller.close();
    } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream({ messages: [{ role: "user", content: "Hi" }], maxTokens: 20 }, token => tokens.push(token));

    expect(tokens.join("")).toBe("model fallback");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("gemini-2.5-flash-lite");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("gemini-2.5-flash");
  });

  it("uses the compatible zero-thinking setting for Gemini 2.5 models", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"OK"}]}}]}\n\n'));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await invokeWorkspaceLLMStream({ messages: [{ role: "user", content: "Hi" }], maxTokens: 20 }, () => {});

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it("routes the custom SM+3.1 Pro prompt through Manus only when explicitly selected", async () => {
    process.env.AI_PROVIDER_ORDER = "manus";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEYS;
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example";
    process.env.BUILT_IN_FORGE_API_KEY = "test-key";
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"SM response"}}]}\n\n'));
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream({
      model: "sm-plus-3.1-pro",
      messages: [{ role: "user", content: "Hello" }],
      maxTokens: 120,
    }, token => tokens.push(token));

    expect(tokens.join("")).toBe("SM response");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://forge.example/v1/chat/completions");
    expect(request.model).toBe("sm-plus-3.1-pro");
    expect(request.messages[0].content).toContain("SM+3.1 Pro");
    expect(request.messages[0].content).toContain("Chat cannot change project files");
    expect(request.messages[0].content).not.toContain("website");
  });

  it("routes the custom SM+3.1 Pro prompt through Gemini", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example";
    process.env.BUILT_IN_FORGE_API_KEY = "test-key";
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"SM response"}]}}]}\n\n'));
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      controller.close();
    } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const tokens: string[] = [];

    await invokeWorkspaceLLMStream({
      model: "sm-plus-3.1-pro",
      messages: [{ role: "user", content: "Hello" }],
      maxTokens: 120,
    }, token => { tokens.push(token); });

    expect(tokens.join("")).toBe("SM response");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("generativelanguage.googleapis.com");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.systemInstruction.parts[0].text).toContain("SM+3.1 Pro");
    expect(request.systemInstruction.parts[0].text).toContain("Chat cannot change project files");
  });

  it("uses Gemini structured generation for the custom SM agent", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }],
    }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const result = await invokeGeminiStructured({
      model: "sm-plus-3.1-pro",
      messages: [{ role: "system", content: "SM custom instructions" }, { role: "user", content: "Hello" }],
    });
    expect(result.model).toBe("gemini-2.5-flash");
  });

  it("converts production JSON schema to Gemini's supported response-schema fields", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "{\"connected\":true}" }] } }],
    }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await invokeGeminiStructured({
      messages: [{ role: "user", content: "Return connected true." }],
      outputSchema: {
        name: "connection_check",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            connected: { type: "boolean", minLength: 1 },
            files: { type: "array", items: { type: "object", properties: { path: { type: "string", maxLength: 12 } } } },
          },
          required: ["connected"],
        },
      },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.generationConfig.responseSchema).toEqual({
      type: "OBJECT",
      properties: {
        connected: { type: "BOOLEAN" },
        files: {
          type: "ARRAY",
          items: { type: "OBJECT", properties: { path: { type: "STRING" } } },
        },
      },
      required: ["connected"],
    });
  });

  it("rotates server-side keys for structured Gemini generation after a quota response", async () => {
    process.env.GEMINI_API_KEYS = "first-structured-key,second-structured-key";
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "{\"connected\":true}" }] } }],
      }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    const result = await invokeGeminiStructured({
      messages: [{ role: "user", content: "Return connected true." }],
    });

    expect(result.model).toBe("gemini-3.5-flash-lite");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-goog-api-key")).toBe("first-structured-key");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("x-goog-api-key")).toBe("second-structured-key");
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("structured-key"))).toBe(true);
  });

  it("only lists free-tier Gemini models", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      models: [
        { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.6-flash", displayName: "Gemini 3.6 Flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemma-4-26b-a4b-it", displayName: "Gemma 4 26B", supportedGenerationMethods: ["generateContent"] },
      ],
    }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    expect(isFreeGeminiModel("gemini-2.5-flash")).toBe(true);
    expect(isFreeGeminiModel("gemini-3.8-flash")).toBe(true);
    expect(isFreeGeminiModel("gemini-3.6-flash")).toBe(false);
    expect(isFreeGeminiModel("gemma-4-26b-a4b-it")).toBe(false);
    expect(await listGeminiModels()).toEqual([
      { name: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
      { name: "gemini-3.8-flash", displayName: "Gemini 3.8 Flash" },
    ]);
  });

  it("sends selected media only to Gemini through a server-side credential and returns content observations", async () => {
    process.env.GEMINI_API_KEY = "media-test-server-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    const media = Buffer.from("synthetic-media-bytes");
    const reviewResponse = JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              summary: "An abstract synthetic image.",
              observations: ["Blue shapes on a white background."],
              timestampFindings: [],
              aiGenerationEstimate: {
                aiGeneratedLikelihoodPercent: 68,
                selfAssessedConfidencePercent: 80,
                explanation: "Several visible details look synthetic, though the image is not conclusive.",
              },
            }),
          }],
        },
      }],
    });
    const fetchMock = vi.fn().mockImplementation(async () => new Response(reviewResponse, { status: 200 }));
    fetchMock
      .mockResolvedValueOnce(new Response("", {
        status: 200,
        headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=test" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ file: { name: "files/test-file", uri: "https://generativelanguage.googleapis.com/v1beta/files/test-file" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: "ACTIVE" }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    const result = await analyzeGeminiMedia(media, "image/png", undefined, {
      responseLanguage: "English",
      question: "What is visible?",
    });

    expect(result).toEqual({
      model: "gemini-3.5-flash-lite",
      provider: "Google Gemini API",
      summary: "An abstract synthetic image.",
      observations: ["Blue shapes on a white background."],
      timestampFindings: [],
      reviewPasses: [
        {
          method: "Scene and lighting consistency",
          aiGeneratedLikelihoodPercent: 68,
          selfAssessedConfidencePercent: 80,
          explanation: "Several visible details look synthetic, though the image is not conclusive.",
        },
        {
          method: "Fine-detail inspection",
          aiGeneratedLikelihoodPercent: 68,
          selfAssessedConfidencePercent: 80,
          explanation: "Several visible details look synthetic, though the image is not conclusive.",
        },
      ],
      aiGenerationEstimate: {
        aiGeneratedLikelihoodPercent: 68,
        explanation: expect.stringContaining("The 2 visual reviews leaned toward AI-generated"),
      },
      providerFileCleanup: "deleted",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://generativelanguage.googleapis.com/upload/v1beta/files");
    expect(String(fetchMock.mock.calls[3]?.[0])).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-goog-api-key")).toBe("media-test-server-key");
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body)).contents[0].parts[1]).toEqual({
      fileData: { mimeType: "image/png", fileUri: "https://generativelanguage.googleapis.com/v1beta/files/test-file" },
    });
    const generationRequest = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));
    expect(generationRequest.systemInstruction.parts[0].text).toContain("Write all user-facing output in English");
    expect(generationRequest.systemInstruction.parts[0].text).toContain("not calibrated confidence");
    expect(generationRequest.systemInstruction.parts[0].text).toContain("Do not default to 50 just because certainty is imperfect");
    expect(generationRequest.contents[0].parts[0].text).toContain("Focus on this user question where relevant: What is visible?");
    expect(generationRequest.contents[0].parts[0].text).toContain("aiGeneratedLikelihoodPercent");
    expect(generationRequest.contents[0].parts[0].text).toContain("selfAssessedConfidencePercent");
    expect(generationRequest.contents[0].parts[0].text).toContain("Do not choose 50 as a safe default");
    expect(generationRequest.contents[0].parts[0].text).toContain("Scene and lighting consistency");
    expect(String(fetchMock.mock.calls[4]?.[0])).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    const secondReviewRequest = JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body));
    expect(secondReviewRequest.contents[0].parts[0].text).toContain("Fine-detail inspection");
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(String(fetchMock.mock.calls[3]?.[0])).not.toContain("media-test-server-key");
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBeInstanceOf(Uint8Array);
    expect(String(fetchMock.mock.calls[5]?.[0])).toBe("https://generativelanguage.googleapis.com/v1beta/files/test-file");
    expect(fetchMock.mock.calls[5]?.[1]?.method).toBe("DELETE");
  });

  it("runs all four focused video reviews when the evidence remains unclear", async () => {
    process.env.GEMINI_API_KEY = "media-test-server-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    const scores = [40, 70, 20, 80];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", {
        status: 200,
        headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=test" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ file: { name: "files/test-video", uri: "https://generativelanguage.googleapis.com/v1beta/files/test-video" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: "ACTIVE" }), { status: 200 }));
    for (const score of scores) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                summary: "A short video with ambiguous visual cues.",
                observations: ["A moving object."],
                timestampFindings: [{ timestamp: "00:00:01", description: "The object moves." }],
                aiGenerationEstimate: {
                  aiGeneratedLikelihoodPercent: score,
                  selfAssessedConfidencePercent: 40,
                  explanation: "The available visual evidence is unclear.",
                },
              }),
            }],
          },
        }],
      }), { status: 200 }));
    }
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    const result = await analyzeGeminiMedia(Buffer.from("synthetic-video"), "video/mp4", undefined, { responseLanguage: "English" });
    const generations = fetchMock.mock.calls.filter(([url]) => String(url).endsWith(":generateContent"));

    expect(result.reviewPasses).toHaveLength(4);
    expect(result.reviewPasses.map(pass => pass.aiGeneratedLikelihoodPercent)).toEqual(scores);
    expect(result.aiGenerationEstimate.aiGeneratedLikelihoodPercent).toBe(53);
    expect(generations).toHaveLength(4);
    expect(JSON.parse(String(generations[1]?.[1]?.body)).contents[0].parts[0].text).toContain("Temporal continuity");
    expect(JSON.parse(String(generations[3]?.[1]?.body)).contents[0].parts[0].text).toContain("Alternative explanations and final review");
    expect(fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[1]?.method).toBe("DELETE");
  });

  it("stops after two identical neutral reviews rather than repeating low-quality uncertainty", async () => {
    process.env.GEMINI_API_KEY = "media-test-server-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", {
        status: 200,
        headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=test" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ file: { name: "files/neutral-image", uri: "https://generativelanguage.googleapis.com/v1beta/files/neutral-image" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: "ACTIVE" }), { status: 200 }));
    for (let index = 0; index < 2; index += 1) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                summary: "Image is low resolution.",
                observations: ["A person is visible."],
                timestampFindings: [],
                aiGenerationEstimate: {
                  aiGeneratedLikelihoodPercent: 50,
                  selfAssessedConfidencePercent: 30,
                  explanation: "Low resolution prevents a reliable conclusion.",
                },
              }),
            }],
          },
        }],
      }), { status: 200 }));
    }
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    const result = await analyzeGeminiMedia(Buffer.from("low-quality-image"), "image/png");
    const generations = fetchMock.mock.calls.filter(([url]) => String(url).endsWith(":generateContent"));

    expect(result.reviewPasses).toHaveLength(2);
    expect(result.aiGenerationEstimate).toEqual({
      aiGeneratedLikelihoodPercent: 50,
      explanation: "Inconclusive: the reviews found insufficient visual evidence to choose either direction.",
    });
    expect(result.aiGenerationEstimate.explanation).not.toContain("scores ranged 0 points");
    expect(generations).toHaveLength(2);
  });

  it("returns a stable timeout error instead of a provider payload", async () => {
    process.env.GEMINI_API_KEY = "media-test-server-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", {
        status: 200,
        headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=test" },
      }))
      .mockRejectedValueOnce(Object.assign(new Error("timeout detail"), { name: "TimeoutError" }));
    global.fetch = fetchMock as typeof fetch;
    await expect(analyzeGeminiMedia(Buffer.from("synthetic"), "image/png")).rejects.toThrow("GEMINI_MEDIA_TIMEOUT");
  });
});

describe("local Ollama media analysis", () => {
  const originalFetch = global.fetch;
  const originalEnvironment = Object.fromEntries(
    ["OLLAMA_BASE_URL", "OLLAMA_MEDIA_MODEL", "OLLAMA_MEDIA_NUM_GPU", "OLLAMA_TIMEOUT_MS", "OLLAMA_KEEP_ALIVE"]
      .map(name => [name, process.env[name]]),
  );

  afterEach(() => {
    global.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("requires an installed Ollama model with vision capability", async () => {
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    process.env.OLLAMA_MEDIA_MODEL = "qwen2.5vl:3b";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ capabilities: ["completion", "vision"] })));

    await expect(verifyOllamaVisionProvider(fetchMock as typeof fetch)).resolves.toMatchObject({
      state: "Ready",
      provider: "Local Ollama",
      model: "qwen2.5vl:3b",
    });
    expect(fetchMock).toHaveBeenCalledWith("http://ollama.test/api/show", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ model: "qwen2.5vl:3b" }),
    }));
  });

  it("resends the image for two separate focused reviews and stops when they agree", async () => {
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    process.env.OLLAMA_MEDIA_MODEL = "qwen2.5vl:3b";
    process.env.OLLAMA_MEDIA_NUM_GPU = "0";
    const modelResponses = [
      {
        summary: "A visible scene.",
        observations: ["One observable detail."],
        aiGenerationEstimate: { aiGeneratedLikelihoodPercent: 62, selfAssessedConfidencePercent: 80, explanation: "A cautious scene review." },
      },
      {
        summary: "A matching scene.",
        observations: ["One matching detail."],
        aiGenerationEstimate: { aiGeneratedLikelihoodPercent: 64, selfAssessedConfidencePercent: 78, explanation: "A consistent detail review." },
      },
    ];
    let responseIndex = 0;
    const requestMock = vi.fn(async () => {
      const modelResponse = modelResponses[responseIndex++];
      const streamedResponse = `${JSON.stringify({ message: { content: JSON.stringify(modelResponse) }, done: true })}\n`;
      return {
      status: 200,
      body: (async function* () {
        yield Buffer.from(streamedResponse);
      })(),
      };
    });

    const image = Buffer.from("image bytes");
    const result = await analyzeOllamaVisionMedia(
      image,
      "image/png",
      "ignored-selection",
      { responseLanguage: "English" },
      requestMock,
    );

    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://ollama.test/api/chat",
      "http://ollama.test/api/chat",
    ]);
    const requestBodies = requestMock.mock.calls.map(([, requestBodyText]) => JSON.parse(requestBodyText));
    for (const requestBody of requestBodies) {
      expect(requestBody.model).toBe("qwen2.5vl:3b");
      expect(requestBody.messages[0].images).toEqual([image.toString("base64")]);
      expect(requestBody.messages[0].content).toContain("Answer in English");
      expect(requestBody.stream).toBe(true);
      expect(requestBody.format.required).toContain("aiGenerationEstimate");
      expect(requestBody.options.num_predict).toBe(320);
      expect(requestBody.options.num_gpu).toBe(0);
    }
    expect(requestBodies[0].messages[0].content).toContain("scene coherence");
    expect(requestBodies[1].messages[0].content).toContain("Focus on edges");
    expect(requestBodies[0].messages[0].content).not.toBe(requestBodies[1].messages[0].content);
    expect(result).toMatchObject({
      provider: "Local Ollama",
      model: "qwen2.5vl:3b",
      aiGenerationEstimate: { aiGeneratedLikelihoodPercent: 63 },
      providerFileCleanup: "local",
    });
    expect(result.reviewPasses).toHaveLength(2);
    expect(result.reviewPasses[0].method).toBe("Scene and lighting consistency");
    expect(result.reviewPasses[1].method).toBe("Fine-detail inspection");
    expect(result.observations).toEqual(["One observable detail.", "One matching detail."]);
  });

  it("runs up to four separate reviews when their visual scores keep disagreeing", async () => {
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    process.env.OLLAMA_MEDIA_MODEL = "qwen2.5vl:3b";
    const scores = [25, 90, 30, 85];
    let responseIndex = 0;
    const requestMock = vi.fn(async () => {
      const score = scores[responseIndex++];
      const result = {
        summary: "A scene.",
        observations: ["A visible detail."],
        aiGenerationEstimate: {
          aiGeneratedLikelihoodPercent: score,
          selfAssessedConfidencePercent: 90,
          explanation: "A separate visual review.",
        },
      };
      return {
        status: 200,
        body: (async function* () {
          yield Buffer.from(`${JSON.stringify({ message: { content: JSON.stringify(result) }, done: true })}\n`);
        })(),
      };
    });

    const image = Buffer.from("same image for every review");
    const result = await analyzeOllamaVisionMedia(
      image,
      "image/png",
      "ignored-selection",
      { responseLanguage: "English" },
      requestMock,
    );

    expect(requestMock).toHaveBeenCalledTimes(4);
    for (const [, body] of requestMock.mock.calls) {
      expect(JSON.parse(body).messages[0].images).toEqual([image.toString("base64")]);
    }
    expect(result.reviewPasses.map(pass => pass.aiGeneratedLikelihoodPercent)).toEqual(scores);
    expect(result.aiGenerationEstimate.aiGeneratedLikelihoodPercent).toBe(58);
    expect(result.aiGenerationEstimate.explanation).toContain("Inconclusive");
  });
});
