import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY?.trim()
  || process.env.GEMINI_API_KEYS?.split(",").map(key => key.trim()).find(Boolean);
const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";

if (!apiKey) {
  console.error("Gemini live test failed: set GEMINI_API_KEY or GEMINI_API_KEYS in .env.local or .env.");
  process.exitCode = 1;
} else {
  const startedAt = performance.now();

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Hello. Reply with a short greeting." }] }],
          generationConfig: { maxOutputTokens: 128 },
        }),
      },
    );
    const elapsedMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      const detail = await response.text();
      console.error(`Gemini live test failed: HTTP ${response.status} after ${elapsedMs} ms.`);
      if (detail) console.error(detail.slice(0, 1000));
      process.exitCode = 1;
    } else {
      const payload = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const answer = payload.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

      if (!answer) {
        console.error(`Gemini returned no text for ${model} after ${elapsedMs} ms.`);
        process.exitCode = 1;
      } else {
        console.info(`Gemini live test succeeded`);
        console.info(`Model: ${model}`);
        console.info(`Elapsed: ${elapsedMs} ms`);
        console.info(`Response: ${answer}`);
      }
    }
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    const reason = error instanceof Error && error.name === "TimeoutError"
      ? "request timed out after 30 seconds"
      : error instanceof Error
        ? error.message
        : "unknown network or runtime error";
    console.error(`Gemini live test failed after ${elapsedMs} ms: ${reason}`);
    process.exitCode = 1;
  }
}
