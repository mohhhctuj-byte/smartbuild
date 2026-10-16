import { describe, expect, it, vi } from "vitest";

describe("project API secret encryption", () => {
  it("encrypts keys at rest and detects ciphertext tampering", async () => {
    vi.stubEnv("PROJECT_SECRETS_ENCRYPTION_KEY", "server-project-key-that-is-long-enough-for-encryption");
    const { decryptProjectSecret, encryptProjectSecret } = await import("./projectSecrets");
    const original = "provider-secret-value";
    const encrypted = encryptProjectSecret(original);

    expect(encrypted.ciphertext).not.toContain(original);
    expect(decryptProjectSecret(encrypted)).toBe(original);
    expect(() => decryptProjectSecret({ ...encrypted, authTag: Buffer.alloc(16).toString("base64") })).toThrow();
    vi.unstubAllEnvs();
  });

  it("accepts only bounded API key metadata and values", async () => {
    const { validProjectSecretInput } = await import("./projectSecrets");
    expect(validProjectSecretInput({ name: "GEMINI_API_KEY", provider: "Gemini", value: "key-value" })).toBe(true);
    expect(validProjectSecretInput({ name: "../key", provider: "Gemini", value: "key-value" })).toBe(false);
    expect(validProjectSecretInput({ name: "KEY", provider: " ", value: "key-value" })).toBe(false);
    expect(validProjectSecretInput({ name: "KEY", provider: "Gemini", value: "" })).toBe(false);
    expect(validProjectSecretInput({ name: "KEY", provider: "Gemini", value: "x".repeat(10_001) })).toBe(false);
  });
});
