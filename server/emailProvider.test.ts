import { describe, expect, it, vi } from "vitest";
import { getEmailProviderStatus, sendEmailOtp, sendResendDiagnosticEmail, sendResendOtp, verifyEmailProvider, verifyResendProvider } from "./emailProvider";

const testConfig = {
  resendApiKey: "test-key",
  emailFrom: "onboarding@resend.dev",
  appBaseUrl: "https://smartbuild.example",
  firstPartyOwnerEmail: "owner@example.test",
};

function response(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("email provider configuration", () => {
  it("returns a safe missing-configuration code without any secret value", () => {
    expect(getEmailProviderStatus({ appBaseUrl: "https://smartbuild.example" })).toEqual({
      configured: false,
      state: "blocked",
      diagnosticCode: "MISSING_CONFIGURATION",
      message: "Verification email service is not configured",
      missingSecrets: ["RESEND_API_KEY", "EMAIL_FROM"],
      provider: "resend",
    });
  });

  it("uses Gmail SMTP STARTTLS configuration and confirms provider readiness without exposing credentials", async () => {
    const smtpConfig = { appBaseUrl: "https://smartbuild.example", smtpUser: "owner@gmail.com", smtpPassword: "app-password", smtpHost: "smtp.gmail.com", smtpPort: 587 };
    const transport = { verify: vi.fn().mockResolvedValue(undefined), sendMail: vi.fn() };
    await expect(verifyEmailProvider(smtpConfig, fetch, () => transport)).resolves.toEqual({ configured: true, state: "ready", diagnosticCode: "READY", missingSecrets: [], provider: "gmail_smtp" });
    expect(transport.verify).toHaveBeenCalledTimes(1);
  });

  it("reports rejected Gmail SMTP credentials without exposing the configured password", async () => {
    const smtpConfig = { appBaseUrl: "https://smartbuild.example", smtpUser: "owner@gmail.com", smtpPassword: "private-app-password" };
    const transport = { verify: vi.fn().mockRejectedValue(Object.assign(new Error("private-app-password must not escape"), { code: "EAUTH" })), sendMail: vi.fn() };
    await expect(verifyEmailProvider(smtpConfig, fetch, () => transport)).resolves.toMatchObject({
      configured: true,
      state: "blocked",
      diagnosticCode: "SMTP_AUTH_FAILED",
    });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it("accepts an SMTP OTP only when the transport returns a message id and accepted recipient", async () => {
    const smtpConfig = { appBaseUrl: "https://smartbuild.example", smtpUser: "owner@gmail.com", smtpPassword: "app-password" };
    const transport = { verify: vi.fn(), sendMail: vi.fn().mockResolvedValue({ messageId: "smtp-message-123", accepted: ["recipient@example.test"] }) };
    await expect(sendEmailOtp({ to: "recipient@example.test", otp: "123456", purpose: "verify_email" }, smtpConfig, fetch, () => transport)).resolves.toEqual({ state: "sent", diagnosticCode: "READY", messageId: "smtp-message-123" });
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it("maps SMTP authentication failure to a safe code without raw provider details", async () => {
    const smtpConfig = { appBaseUrl: "https://smartbuild.example", smtpUser: "owner@gmail.com", smtpPassword: "app-password" };
    const transport = { verify: vi.fn(), sendMail: vi.fn().mockRejectedValue(Object.assign(new Error("provider detail must not escape"), { code: "EAUTH" })) };
    await expect(sendEmailOtp({ to: "recipient@example.test", otp: "123456", purpose: "verify_email" }, smtpConfig, fetch, () => transport)).resolves.toEqual({ state: "blocked", diagnosticCode: "SMTP_AUTH_FAILED" });
  });

  it("classifies a single absent API key as an unreloaded deployment secret", () => {
    expect(getEmailProviderStatus({ ...testConfig, resendApiKey: "" })).toMatchObject({
      state: "blocked",
      diagnosticCode: "DEPLOYMENT_SECRET_NOT_RELOADED",
    });
  });

  it("classifies an unauthorised provider response as an invalid key without exposing response data", async () => {
    const request = vi.fn().mockResolvedValue(response(401, { message: "Invalid API key" }));
    await expect(verifyResendProvider(testConfig, request)).resolves.toMatchObject({ state: "blocked", diagnosticCode: "INVALID_API_KEY" });
  });

  it("requires a verified custom domain after successful credential validation", async () => {
    const request = vi.fn().mockResolvedValue(response(200, { data: [{ name: "mydomain.com", status: "pending" }] }));
    await expect(verifyResendProvider({ ...testConfig, emailFrom: "noreply@mydomain.com" }, request)).resolves.toMatchObject({
      state: "blocked",
      diagnosticCode: "UNVERIFIED_SENDER_DOMAIN",
    });
  });

  it("allows the temporary Resend sender only for the configured owner address without making a network request", async () => {
    const request = vi.fn();
    await expect(sendResendOtp({ to: "other@example.test", otp: "123456", purpose: "verify_email" }, testConfig, request)).resolves.toEqual({
      state: "blocked",
      diagnosticCode: "RESEND_DEV_RECIPIENT_RESTRICTED",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("classifies quota and network failures with redacted codes", async () => {
    await expect(sendResendOtp({ to: testConfig.firstPartyOwnerEmail, otp: "123456", purpose: "verify_email" }, testConfig, vi.fn().mockResolvedValue(response(429, {})))).resolves.toEqual({
      state: "blocked",
      diagnosticCode: "QUOTA_OR_RATE_LIMIT",
    });
    await expect(sendResendOtp({ to: testConfig.firstPartyOwnerEmail, otp: "123456", purpose: "verify_email" }, testConfig, vi.fn().mockRejectedValue(new Error("offline")))).resolves.toEqual({
      state: "blocked",
      diagnosticCode: "NETWORK_OR_PROVIDER_ERROR",
    });
  });

  it("runs a server-only diagnostic to the owner and reports sent only when Resend returns a message id", async () => {
    const request = vi.fn().mockResolvedValue(response(200, { id: "email_message_123" }));
    await expect(sendResendDiagnosticEmail(testConfig, request)).resolves.toEqual({ state: "sent", diagnosticCode: "READY", messageId: "email_message_123" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0]?.[1]?.body)).not.toContain("123456");
  });

  it("does not claim diagnostic delivery when Resend omits a message id", async () => {
    await expect(sendResendDiagnosticEmail(testConfig, vi.fn().mockResolvedValue(response(200, {})))).resolves.toEqual({
      state: "blocked",
      diagnosticCode: "PROVIDER_RESPONSE_INVALID",
    });
  });
});
