import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ENV } from "./_core/env";

const SECRET_KEY_LENGTH = 32;

function encryptionKey() {
  if (ENV.projectSecretsEncryptionKey.length < SECRET_KEY_LENGTH) throw new Error("PROJECT_SECRET_ENCRYPTION_UNAVAILABLE");
  return createHash("sha256").update(`smartbuild-project-secrets:v1:${ENV.projectSecretsEncryptionKey}`).digest();
}

export function encryptProjectSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptProjectSecret(secret: { ciphertext: string; iv: string; authTag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function validProjectSecretInput(input: unknown): input is { name: string; provider: string; value: string } {
  if (!input || typeof input !== "object") return false;
  const value = input as Record<string, unknown>;
  return typeof value.name === "string"
    && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value.name)
    && typeof value.provider === "string"
    && value.provider.length <= 80
    && value.provider.trim().length > 0
    && value.provider.trim().length <= 80
    && typeof value.value === "string"
    && value.value.length > 0
    && value.value.length <= 10_000;
}
