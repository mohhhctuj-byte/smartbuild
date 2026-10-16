# Chat AI provider fallback

SmartBuild chat uses the server-side provider chain in `AI_PROVIDER_ORDER`. The default order is:

```dotenv
AI_PROVIDER_ORDER=gemini,groq
```

The server calls Gemini first, then moves to the next configured provider after an HTTP 429, HTTP 5xx, timeout, network failure, or invalid/empty provider response. Authentication errors, invalid requests, and safety blocks are returned instead of being silently retried through another service. A provider without a configured key is skipped. If a stream has already produced answer text, the request fails rather than mixing partial answers from different models.

Add provider keys to the server-only `.env.local` (or the deployment's secret environment). Never prefix them with `VITE_` or send them to the browser:

```dotenv
GEMINI_API_KEY=
# Or provide a comma-separated pool instead:
# GEMINI_API_KEYS=key-one,key-two
GEMINI_MODEL=gemini-3.8-flash

GROQ_API_KEY=
GROQ_MODEL=qwen/qwen3.8-27b

```

Each provider uses its own model and server-side key. Gemini uses its native API and Groq uses its OpenAI-compatible chat-completions endpoint. GitHub Models was retired on July 30, 2026 and is not part of the configured fallback chain. The implementation uses Node's built-in `fetch`; no additional npm or pip package is required. Restart the server after changing environment variables.

The workspace chat and generic structured-generation path use this provider chain. OpenAI-compatible streaming providers are read as SSE, with JSON `choices[0].message.content` accepted if a provider responds with a non-streaming JSON body. Explicit Claude selections and specialized production-agent calls that directly select Gemini retain their existing provider behavior. Media uploads use their separately configured provider and are not silently sent to these chat fallbacks.

When the provider chain ends in a network error, timeout, HTTP 429, or HTTP 5xx, text-only chat can make a final attempt with Chrome's built-in `LanguageModel` Prompt API. The browser fallback does not run for invalid requests, authentication failures, user cancellation, messages with attachments, or streams that already returned answer text. It uses the browser/device model rather than a server API, so it may be unavailable or require Chrome configuration and a one-time model download; it is not an unlimited or guaranteed service. If the model is not installed, the chat shows a **Prepare local AI** button so the user can explicitly initiate Chrome's download. If the server is still reachable, the local answer is added to the conversation. Otherwise, the answer is kept in that browser's local storage and merged into the conversation view on later visits from that browser.

For a server-side one-shot text request, import `generateTextWithFallback` from `server/llmStream.ts`:

```ts
const answer = await generateTextWithFallback(userPrompt);
```

It returns the completed text or throws if all available providers fail; it does not return a partial answer from a provider that failed mid-stream.

To make a real, single-provider Gemini smoke test using the configured server key:

```powershell
pnpm test:live-llm
```

The script loads `.env.local` and `.env`, sends `Hello` to the configured `GEMINI_MODEL` (default `gemini-3.8-flash`), and prints the response and elapsed time. It contacts Google and may consume API quota; it does not exercise the fallback chain.

Provider credentials being configured does not guarantee the provider endpoint is currently available. Verify each provider with a live smoke test before relying on it as a fallback.
