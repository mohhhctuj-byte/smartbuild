import { beforeEach, describe, expect, it, vi } from "vitest";

type Account = { id: number; email: string; passwordHash: string; emailVerified: boolean; userId: number | null; displayName: string | null };
type Code = { id: number; accountId: number; purpose: "verify_email" | "password_reset"; codeHash: string; expiresAt: Date; maxAttempts: number; attemptCount: number; usedAt: Date | null };

const state = vi.hoisted(() => ({
  accounts: [] as Account[],
  codes: [] as Code[],
  sent: [] as Array<{ to: string; otp: string; purpose: "verify_email" | "password_reset" }>,
  sessions: [] as Array<{ id: string; accountId: number; userId: number; tokenHash: string; expiresAt: Date }>,
  delivery: "sent" as "sent" | "blocked",
  allowRateLimit: true,
  ownerEmail: "",
  canonicalOwner: undefined as { id: number } | undefined,
  upsertUserCalls: 0,
}));

vi.mock("./_core/env", () => ({
  ENV: {
    get firstPartyOwnerEmail() { return state.ownerEmail; },
  },
}));

vi.mock("./db", () => ({
  getAuthAccountByEmail: vi.fn(async (email: string) => state.accounts.find(account => account.email === email)),
  createAuthAccount: vi.fn(async (email: string, passwordHash: string, displayName?: string) => {
    const account = { id: state.accounts.length + 1, email, passwordHash, displayName: displayName ?? null, emailVerified: false, userId: null };
    state.accounts.push(account);
    return account;
  }),
  updateAuthAccountDisplayName: vi.fn(async (id: number, displayName: string) => {
    const account = state.accounts.find(item => item.id === id);
    if (account) account.displayName = displayName;
    return account;
  }),
  replaceAuthCode: vi.fn(async (input: Omit<Code, "id" | "attemptCount" | "usedAt">) => {
    state.codes.filter(code => code.accountId === input.accountId && code.purpose === input.purpose && !code.usedAt).forEach(code => { code.usedAt = new Date(); });
    const code = { id: state.codes.length + 1, ...input, attemptCount: 0, usedAt: null };
    state.codes.push(code);
    return code;
  }),
  getActiveAuthCode: vi.fn(async (accountId: number, purpose: Code["purpose"]) => [...state.codes].reverse().find(code => code.accountId === accountId && code.purpose === purpose && !code.usedAt)),
  incrementAuthCodeAttempts: vi.fn(async (id: number) => { const code = state.codes.find(item => item.id === id); if (code) code.attemptCount += 1; }),
  consumeAuthCode: vi.fn(async (id: number) => { const code = state.codes.find(item => item.id === id); if (code) code.usedAt = new Date(); }),
  markAuthAccountVerified: vi.fn(async (id: number, userId: number) => { const account = state.accounts.find(item => item.id === id); if (account) { account.emailVerified = true; account.userId = userId; } }),
  getCanonicalReleaseGateOwner: vi.fn(async () => state.canonicalOwner),
  clearAuthRateLimit: vi.fn(async () => undefined),
  upsertUser: vi.fn(async () => { state.upsertUserCalls += 1; return { id: 70001 }; }),
  createAuthSession: vi.fn(async (session: { id: string; accountId: number; userId: number; tokenHash: string; expiresAt: Date }) => { state.sessions.push(session); return session; }),
  revokeAuthSession: vi.fn(async (tokenHash: string) => { state.sessions = state.sessions.filter(session => session.tokenHash !== tokenHash); }),
  updateAuthAccountPassword: vi.fn(async (id: number, passwordHash: string) => { const account = state.accounts.find(item => item.id === id); if (account) account.passwordHash = passwordHash; }),
  takeAuthRateLimit: vi.fn(async (input: { action: string }) => {
    if (input.action === "smtp_send") return { allowed: false, retryAfterSeconds: 60 };
    return state.allowRateLimit ? { allowed: true, retryAfterSeconds: 0 } : { allowed: false, retryAfterSeconds: input.action === "login" ? 10 : 60 };
  }),
}));

vi.mock("./emailProvider", () => ({
  sendEmailOtp: vi.fn(async (input: { to: string; otp: string; purpose: "verify_email" | "password_reset" }) => {
    if (state.delivery === "blocked") return { state: "blocked", diagnosticCode: "INVALID_API_KEY" };
    state.sent.push(input);
    return { state: "sent" };
  }),
}));

import {
  createDemoSession,
  createGuestSession,
  FirstPartyAuthError,
  hashSessionToken,
  loginWithEmail,
  logoutFirstPartySession,
  requestPasswordReset,
  resetPasswordWithOtp,
  resendVerificationOtp,
  readDemoSession,
  readGuestSession,
  signUpWithEmail,
  verifyEmailOtp,
} from "./firstPartyAuth";

beforeEach(() => {
  state.accounts = [];
  state.codes = [];
  state.sent = [];
  state.sessions = [];
  state.delivery = "sent";
  state.allowRateLimit = true;
  state.ownerEmail = "";
  state.canonicalOwner = undefined;
  state.upsertUserCalls = 0;
});

async function createVerifiedAccount(email = "owner@example.test") {
  await signUpWithEmail({ email, password: "a-strong-password", name: "Test User" });
  const otp = state.sent.at(-1)!.otp;
  await verifyEmailOtp({ email, otp });
  return { email, password: "a-strong-password" };
}

describe("first-party SmartBuild authentication", () => {
  it("hashes the password and OTP, verifies once, and creates no OTP response payload", async () => {
    await expect(signUpWithEmail({ email: "new@example.test", password: "a-strong-password", name: "New User" })).resolves.toEqual({ email: "new@example.test", state: "verification_required" });
    expect(state.accounts[0]!.passwordHash).not.toBe("a-strong-password");
    expect(state.accounts[0]!.displayName).toBe("New User");
    expect(state.codes[0]!.codeHash).not.toBe(state.sent[0]!.otp);
    await expect(verifyEmailOtp({ email: "new@example.test", otp: state.sent[0]!.otp })).resolves.toEqual({ userId: 70001 });
    expect(state.codes[0]!.usedAt).toBeInstanceOf(Date);
    await expect(verifyEmailOtp({ email: "new@example.test", otp: state.sent[0]!.otp })).rejects.toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("rejects wrong and expired OTP values without accepting them", async () => {
    await signUpWithEmail({ email: "wrong@example.test", password: "a-strong-password", name: "Wrong User" });
    await expect(verifyEmailOtp({ email: "wrong@example.test", otp: "000000" })).rejects.toMatchObject({ code: "INVALID_OTP" });
    expect(state.codes[0]!.attemptCount).toBe(1);
    state.codes[0]!.expiresAt = new Date(Date.now() - 1);
    await expect(verifyEmailOtp({ email: "wrong@example.test", otp: state.sent[0]!.otp })).rejects.toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("enforces resend rate limits and never leaves a code active when Resend delivery is blocked", async () => {
    await signUpWithEmail({ email: "resend@example.test", password: "a-strong-password", name: "Resend User" });
    state.allowRateLimit = false;
    await expect(resendVerificationOtp("resend@example.test")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    state.allowRateLimit = true;
    state.delivery = "blocked";
    await expect(resendVerificationOtp("resend@example.test")).rejects.toMatchObject({ code: "DELIVERY_BLOCKED", message: "Email verification is temporarily unavailable.", diagnosticCode: "INVALID_API_KEY" });
    expect(state.codes.at(-1)!.usedAt).toBeInstanceOf(Date);
  });

  it("does not apply the retired app-level SMTP daily counter while retaining normal account rate limiting", async () => {
    await expect(signUpWithEmail({ email: "smtp-limit@example.test", password: "a-strong-password", name: "SMTP User" })).resolves.toMatchObject({ state: "verification_required" });
    expect(state.sent).toHaveLength(1);
  });

  it("creates a signed, short-lived demo session that has no account or persistent session", () => {
    const now = Date.now();
    const demo = createDemoSession(now);
    expect(readDemoSession(demo.token, now)).toEqual({ expiresAt: demo.expiresAt });
    expect(readDemoSession(demo.token, demo.expiresAt.getTime())).toBeNull();
    expect(state.accounts).toHaveLength(0);
    expect(state.sessions).toHaveLength(0);
  });

  it("creates a signed guest session scoped to one user and rejects tampering or expiry", () => {
    const now = Date.now();
    const guest = createGuestSession(74001, now);
    expect(readGuestSession(guest.token, now)).toEqual({ userId: 74001, expiresAt: guest.expiresAt });
    expect(readGuestSession(`${guest.token}tampered`, now)).toBeNull();
    expect(readGuestSession(guest.token, guest.expiresAt.getTime())).toBeNull();
  });

  it("allows verified login, stores only a session hash, and revokes it at logout", async () => {
    const credentials = await createVerifiedAccount();
    const session = await loginWithEmail(credentials);
    expect(session.token).toHaveLength(43);
    expect(state.sessions[0]!.tokenHash).toBe(hashSessionToken(session.token));
    expect(state.sessions[0]!.tokenHash).not.toBe(session.token);
    await logoutFirstPartySession(session.token);
    expect(state.sessions).toHaveLength(0);
  });

  it("uses a ten-second cooldown for repeated login attempts", async () => {
    const credentials = await createVerifiedAccount("login-limit@example.test");
    state.allowRateLimit = false;

    await expect(loginWithEmail(credentials)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "Too many attempts. Please wait 10 seconds before trying again.",
      retryAfterSeconds: 10,
    });
  });

  it("never claims the canonical workspace merely because a verified account logs in", async () => {
    const ownerEmail = "owner@smartbuild.test";
    const credentials = await createVerifiedAccount(ownerEmail);
    expect(state.accounts[0]!.userId).toBe(70001);

    state.ownerEmail = ownerEmail;
    state.canonicalOwner = { id: 424242 };
    await loginWithEmail(credentials);

    expect(state.accounts[0]!.userId).toBe(70001);
    expect(state.sessions[0]!.userId).toBe(70001);
  });

  it("requires verification before login and handles a password-reset OTP once", async () => {
    await signUpWithEmail({ email: "unverified@example.test", password: "a-strong-password", name: "Unverified User" });
    await expect(loginWithEmail({ email: "unverified@example.test", password: "a-strong-password" })).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    const credentials = await createVerifiedAccount("reset@example.test");
    await requestPasswordReset(credentials.email);
    const resetOtp = state.sent.at(-1)!.otp;
    await resetPasswordWithOtp({ email: credentials.email, otp: resetOtp, password: "another-strong-password" });
    await expect(loginWithEmail({ email: credentials.email, password: "another-strong-password" })).resolves.toMatchObject({ token: expect.any(String) });
    await expect(resetPasswordWithOtp({ email: credentials.email, otp: resetOtp, password: "third-strong-password" })).rejects.toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("does not claim a message was sent for an invalid Resend configuration", async () => {
    state.delivery = "blocked";
    await expect(signUpWithEmail({ email: "blocked@example.test", password: "a-strong-password", name: "Blocked User" })).rejects.toMatchObject({ code: "DELIVERY_BLOCKED", message: "Email verification is temporarily unavailable.", diagnosticCode: "INVALID_API_KEY" });
    expect(state.sent).toHaveLength(0);
  });

  it("always creates a personal workspace user during OTP verification and never depends on the canonical pair", async () => {
    state.ownerEmail = "owner@smartbuild.test";
    state.canonicalOwner = { id: 424242 };
    await signUpWithEmail({ email: state.ownerEmail, password: "a-strong-password", name: "Owner User" });
    await expect(verifyEmailOtp({ email: state.ownerEmail, otp: state.sent.at(-1)!.otp })).resolves.toEqual({ userId: 70001 });
    expect(state.accounts[0]!.userId).toBe(70001);
    expect(state.upsertUserCalls).toBe(1);

    state.ownerEmail = "blocked-owner@smartbuild.test";
    state.canonicalOwner = undefined;
    await signUpWithEmail({ email: state.ownerEmail, password: "a-strong-password", name: "Blocked Owner" });
    await expect(verifyEmailOtp({ email: state.ownerEmail, otp: state.sent.at(-1)!.otp })).resolves.toEqual({ userId: 70001 });
    expect(state.upsertUserCalls).toBe(2);
  });
});
