export type ProviderState = "Ready" | "Blocked";

export type ProviderStatus = {
  id: "manus" | "ollama" | "gemini" | "groq" | "github_models" | "local" | "byok" | "storage" | "database" | "callback";
  label: string;
  state: ProviderState;
  reason: string;
};

export function getProviderStatus(env: NodeJS.ProcessEnv = process.env): ProviderStatus[] {
  const builtInReady = Boolean(env.BUILT_IN_FORGE_API_URL && env.BUILT_IN_FORGE_API_KEY);
  const ollamaModelsReady = Boolean(env.OLLAMA_MODEL?.trim());
  const geminiReady = Boolean([...(env.GEMINI_API_KEYS || "").split(","), env.GEMINI_API_KEY || ""].some(key => key.trim() && key.trim() !== "undefined"));
  const groqReady = Boolean(env.GROQ_API_KEY?.trim());
  const githubModelsReady = Boolean(env.GITHUB_MODELS_API_KEY?.trim() || env.GITHUB_TOKEN?.trim());
  const localReady = env.LOCAL_AI_ENABLED?.trim().toLowerCase() === "true";
  const storageReady = builtInReady;
  const byokReady = Boolean(env.VEYRA_BYOK_API_KEY);
  const databaseReady = Boolean(env.DATABASE_URL);
  const callbackReady = Boolean(env.OAUTH_SERVER_URL && env.VITE_APP_ID);
  return [
    {
      id: "manus",
      label: "Manus built-in LLM",
      state: builtInReady ? "Ready" : "Blocked",
      reason: builtInReady ? "Built-in reasoning and streaming are available." : "Built-in API configuration is missing.",
    },
    {
      id: "ollama",
      label: "Local Ollama",
      state: ollamaModelsReady ? "Ready" : "Blocked",
      reason: ollamaModelsReady ? "A local model is configured; live connectivity is checked separately." : "Ollama model configuration is missing.",
    },
    {
      id: "gemini",
      label: "Google Gemini API",
      state: geminiReady ? "Ready" : "Blocked",
      reason: geminiReady ? "An API key is configured; live connectivity and quota have not been verified." : "Gemini API key configuration is missing.",
    },
    {
      id: "groq",
      label: "Groq API",
      state: groqReady ? "Ready" : "Blocked",
      reason: groqReady ? "An API key is configured; live connectivity and quota have not been verified." : "Groq API key configuration is missing.",
    },
    {
      id: "github_models",
      label: "GitHub Models",
      state: githubModelsReady ? "Ready" : "Blocked",
      reason: githubModelsReady ? "A server-side token is configured; live connectivity and quota have not been verified." : "GitHub Models token configuration is missing.",
    },
    {
      id: "local",
      label: "Local rules-based fallback",
      state: localReady ? "Ready" : "Blocked",
      reason: localReady ? "Local fallback responses are enabled; this is not a hosted AI model." : "Local fallback responses are disabled.",
    },
    {
      id: "storage",
      label: "Manus S3 storage",
      state: storageReady ? "Ready" : "Blocked",
      reason: storageReady ? "Managed storage is available through the built-in gateway." : "Storage gateway configuration is missing.",
    },
    {
      id: "byok",
      label: "Optional BYOK provider",
      state: byokReady ? "Ready" : "Blocked",
      reason: byokReady ? "An optional provider key is configured server-side." : "No optional provider key is configured; SmartBuild uses its configured server-side providers.",
    },
    {
      id: "database",
      label: "Workspace database",
      state: databaseReady ? "Ready" : "Blocked",
      reason: databaseReady ? "Persistent workspace storage is configured." : "Database configuration is missing; persistent workspace operations are blocked.",
    },
    {
      id: "callback",
      label: "Manus callback configuration",
      state: callbackReady ? "Ready" : "Blocked",
      reason: callbackReady ? "OAuth callback prerequisites are configured." : "Callback prerequisites are missing; authenticated callback flows are blocked.",
    },
  ];
}
