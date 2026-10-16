import { describe, expect, it } from "vitest";
import { BLOCKED_AUTH_STATUS, resolveAuthStatus } from "./authStatus";

describe("resolveAuthStatus", () => {
  it("fails closed instead of leaving the authentication gate loading", async () => {
    const unresolved = () => new Promise<typeof BLOCKED_AUTH_STATUS>(() => undefined);
    await expect(resolveAuthStatus(unresolved, 0)).resolves.toEqual(BLOCKED_AUTH_STATUS);
  });

  it("preserves a completed ready state", async () => {
    const ready = { authenticated: false, emailVerification: { state: "ready" as const } };
    await expect(resolveAuthStatus(async () => ready, 1_000)).resolves.toEqual(ready);
  });
});
