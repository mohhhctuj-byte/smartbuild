import { describe, expect, it } from "vitest";
import { shouldStartOwnerOAuthForRestoration } from "./workspaceOwnerSession";

describe("workspace owner session recovery", () => {
  it("escalates a stale personal cookie to OAuth on persisted-workspace restoration", () => {
    expect(shouldStartOwnerOAuthForRestoration({ authenticated: true, authMode: "personal" }, false)).toBe(true);
  });

  it("never redirects an OAuth owner or an explicit new personal workspace", () => {
    expect(shouldStartOwnerOAuthForRestoration({ authenticated: true, authMode: "oauth" }, false)).toBe(false);
    expect(shouldStartOwnerOAuthForRestoration({ authenticated: true, authMode: "personal" }, true)).toBe(false);
    expect(shouldStartOwnerOAuthForRestoration({ authenticated: false, authMode: "none" }, false)).toBe(false);
  });
});
