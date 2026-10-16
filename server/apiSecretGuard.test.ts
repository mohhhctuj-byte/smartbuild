import { describe, expect, it } from "vitest";
import { containsLikelyApiSecret, detectApiSecret, historyContainsLikelyApiSecret } from "../shared/apiSecretGuard";

describe("API credential chat guard", () => {
  it.each([
    "sk_live_1234567890abcdef",
    "AIza12345678901234567890123456789012",
    "ghp_123456789012345678901234567890123456",
    "api_key=abcdefghijklmnopqrstuvwx",
  ])("recognizes common pasted credential formats without returning their contents", value => {
    expect(containsLikelyApiSecret(value)).toBe(true);
  });

  it("does not flag ordinary requests and detects credentials in chat history", () => {
    expect(containsLikelyApiSecret("Build a page that explains how to get an API key.")).toBe(false);
    expect(historyContainsLikelyApiSecret([{ role: "user", content: "Here is my token: sk_live_1234567890abcdef" }])).toBe(true);
    expect(historyContainsLikelyApiSecret([{ role: "user", content: "Please build a page." }])).toBe(false);
    expect(historyContainsLikelyApiSecret("not a message list")).toBe(false);
  });

  it("routes recognized providers to service-specific secret names and leaves unknown providers for explicit labeling", () => {
    expect(detectApiSecret("sk_test_1234567890abcdef")).toEqual({
      value: "sk_test_1234567890abcdef",
      provider: "Stripe",
      name: "STRIPE_SECRET_KEY",
    });
    expect(detectApiSecret("sk-ant-123456789012345678901234")).toMatchObject({ provider: "Anthropic", name: "ANTHROPIC_API_KEY" });
    expect(detectApiSecret("api_key=abcdefghijklmnopqrstuvwx")).toEqual({
      value: "abcdefghijklmnopqrstuvwx",
      provider: "",
      name: "",
    });
  });
});
