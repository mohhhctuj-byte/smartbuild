import { describe, expect, it } from "vitest";
import { getProviderStatus } from "./providerStatus";

describe("provider status", () => {
  it("reports built-in and storage readiness without exposing secrets", () => {
    const statuses = getProviderStatus({ BUILT_IN_FORGE_API_URL: "https://forge.test", BUILT_IN_FORGE_API_KEY: "secret-value" });
    expect(statuses.find(item => item.id === "manus")?.state).toBe("Ready");
    expect(statuses.find(item => item.id === "storage")?.state).toBe("Ready");
    expect(JSON.stringify(statuses)).not.toContain("secret-value");
  });

  it("reports Gemini configuration without claiming the provider was reached", () => {
    const statuses = getProviderStatus({ GEMINI_API_KEY: "gemini-secret" });
    expect(statuses.find(item => item.id === "gemini")).toMatchObject({
      state: "Ready",
      reason: "An API key is configured; live connectivity and quota have not been verified.",
    });
    expect(statuses.find(item => item.id === "manus")?.state).toBe("Blocked");
    expect(JSON.stringify(statuses)).not.toContain("gemini-secret");
  });

  it("reports local Ollama configuration without claiming connectivity was verified", () => {
    const ollama = getProviderStatus({ OLLAMA_MODEL: "qwen2.5:3b" }).find(item => item.id === "ollama");
    expect(ollama).toMatchObject({
      state: "Ready",
      reason: "A local model is configured; live connectivity is checked separately.",
    });
  });

  it("recognizes comma-separated Gemini keys and labels local fallback honestly", () => {
    const statuses = getProviderStatus({ GEMINI_API_KEYS: "first-key, second-key", LOCAL_AI_ENABLED: "true" });
    expect(statuses.find(item => item.id === "gemini")?.state).toBe("Ready");
    expect(statuses.find(item => item.id === "local")).toMatchObject({
      state: "Ready",
      reason: "Local fallback responses are enabled; this is not a hosted AI model.",
    });
  });

  it("reports Groq and GitHub Models readiness without exposing their tokens", () => {
    const statuses = getProviderStatus({
      GROQ_API_KEY: "groq-secret",
      GITHUB_MODELS_API_KEY: "github-secret",
    });
    expect(statuses.find(item => item.id === "groq")?.state).toBe("Ready");
    expect(statuses.find(item => item.id === "github_models")?.state).toBe("Ready");
    expect(JSON.stringify(statuses)).not.toContain("groq-secret");
    expect(JSON.stringify(statuses)).not.toContain("github-secret");
    expect(getProviderStatus({ GITHUB_TOKEN: "github-pat" }).find(item => item.id === "github_models")?.state).toBe("Ready");
  });

  it("blocks optional BYOK when it is not configured", () => {
    const byok = getProviderStatus({}).find(item => item.id === "byok");
    expect(byok?.state).toBe("Blocked");
    expect(byok?.reason).toContain("No optional provider key");
  });

  it("reports missing database and callback prerequisites explicitly", () => {
    const statuses = getProviderStatus({});
    expect(statuses.find(item => item.id === "database")).toMatchObject({ state: "Blocked" });
    expect(statuses.find(item => item.id === "database")?.reason).toContain("Database configuration is missing");
    expect(statuses.find(item => item.id === "callback")).toMatchObject({ state: "Blocked" });
    expect(statuses.find(item => item.id === "callback")?.reason).toContain("Callback prerequisites are missing");
  });
});
