import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./SmartBuildAuthGate.tsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../index.css", import.meta.url), "utf8");

describe("SmartBuildAuthGate premium first-party surface", () => {
  it("retains the intended signup, verification, and login endpoint contract only", () => {
    [
      "/api/auth/status",
      "/api/auth/signup",
      "/api/auth/verify-email",
      "/api/auth/login",
      "/api/auth/resend-verification",
    ].forEach(endpoint => expect(source).toContain(endpoint));
    expect(source).not.toContain("/api/auth/forgot-password");
    expect(source).not.toContain("/api/auth/reset-password");
    expect(source).not.toMatch(/forgot password|reset password/i);
  });

  it("offers guest access with a nickname and creates a separate guest session", () => {
    expect(source).toContain('"/api/auth/guest"');
    expect(source).toContain('htmlFor="smartbuild-guest-nickname"');
    expect(source).toContain("Continue as guest");
    expect(source).toContain('mode === "login" && <button type="button" onClick={() => switchMode("guest")}');
    expect(source).toContain("nickname.trim().length < 2 || nickname.trim().length > 40");
  });

  it("renders a responsive accessible first-party interface without social sign-in controls", () => {
    expect(source).toContain("lg:grid-cols-[minmax(0,0.95fr)_minmax(25rem,0.8fr)]");
    expect(source).toContain("aria-live=\"polite\"");
    expect(source).toContain("aria-invalid");
    expect(source).toContain("Show password");
    expect(source).toContain("Hide password");
    expect(source).toContain("Private first-party account");
    expect(source).not.toMatch(/oauth|google|social login/i);
  });

  it("keeps provider secrets, sender configuration, tokens, and provider payloads out of the client surface", () => {
    expect(source).not.toMatch(/RESEND_API_KEY|EMAIL_FROM|APP_BASE_URL|FIRST_PARTY_OWNER_EMAIL|session[_-]?token/i);
  });

  it("keeps the blocked verification banner hidden from the sign-in form while retaining the safe fallback copy", () => {
    expect(source).toContain("Email verification is temporarily unavailable.");
    expect(source).toContain("No verification code has been sent.");
    expect(source).not.toMatch(/serviceBlocked\s*&&\s*<div[\s\S]*?role="status"[\s\S]*?Retry/i);
    expect(styles).toContain(".auth-shell");
    expect(styles).toContain(".auth-grid");
    expect(styles).toContain("prefers-reduced-motion: no-preference");
  });

  it("maps allow-listed delivery diagnostics to actionable safe copy without exposing any recipient or provider payload", () => {
    expect(source).toContain("unverified_sender");
    expect(source).toContain("invalid_key");
    expect(source).toContain("quota_limit");
    expect(source).toContain("network_error");
    expect(source).toContain("error instanceof TypeError");
    expect(source).toContain("Could not confirm the request because the connection to SmartBuild was interrupted.");
    expect(source).not.toContain("return error.message");
    expect(source).not.toMatch(/resend api response|provider payload|recipient address/i);
  });

  it("does not render the retired Demo Mode action on the sign-in surface", () => {
    expect(source).not.toContain("Try Demo");
    expect(source).not.toContain("onDemo");
    expect(source).not.toContain("/api/auth/demo-login");
  });
});
