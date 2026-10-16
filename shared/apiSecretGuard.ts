export type DetectedApiSecret = { value: string; provider: string; name: string } | { value: string; provider: ""; name: "" };

const credentialPatterns: Array<{ pattern: RegExp; provider: string; name: string }> = [
  { pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/, provider: "Stripe", name: "STRIPE_SECRET_KEY" },
  { pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/, provider: "Anthropic", name: "ANTHROPIC_API_KEY" },
  { pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/, provider: "OpenAI", name: "OPENAI_API_KEY" },
  { pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/, provider: "Google", name: "GOOGLE_API_KEY" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, provider: "GitHub", name: "GITHUB_TOKEN" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, provider: "GitHub", name: "GITHUB_TOKEN" },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/, provider: "Slack", name: "SLACK_API_TOKEN" },
  { pattern: /\bre_[A-Za-z0-9_-]{20,}\b/, provider: "Resend", name: "RESEND_API_KEY" },
  { pattern: /\b(?:api[_-]?key|secret|access[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9_-]{20,})/i, provider: "", name: "" },
];

export function containsLikelyApiSecret(value: string): boolean {
  return detectApiSecret(value) !== null;
}

export function detectApiSecret(value: string): DetectedApiSecret | null {
  for (const { pattern, provider, name } of credentialPatterns) {
    const match = pattern.exec(value);
    if (!match) continue;
    return { value: match[1] ?? match[0], provider, name };
  }
  return null;
}

export function historyContainsLikelyApiSecret(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some(message => message && typeof message === "object"
    && "content" in message && typeof message.content === "string"
    && containsLikelyApiSecret(message.content));
}
