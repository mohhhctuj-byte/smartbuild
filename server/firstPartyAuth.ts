import argon2 from "argon2";
import crypto from "crypto";
import type { Request } from "express";
import {
  clearAuthRateLimit,
  consumeAuthCode,
  createAuthAccount,
  createAuthSession,
  getActiveAuthCode,
  getAuthAccountByEmail,
  incrementAuthCodeAttempts,
  markAuthAccountVerified,
  replaceAuthCode,
  revokeAuthSession,
  takeAuthRateLimit,
  updateAuthAccountDisplayName,
  updateAuthAccountPassword,
  upsertUser,
} from "./db";
import { sendEmailOtp, type EmailDeliveryState, type EmailDiagnosticCode } from "./emailProvider";
import { getSessionCookieOptions } from "./_core/cookies";

export const FIRST_PARTY_SESSION_COOKIE = "smartbuild_session";
export const REMEMBERED_SESSION_COOKIE = "smartbuild_remembered_session";
export const DEMO_SESSION_COOKIE = "smartbuild_demo";
export const GUEST_SESSION_COOKIE = "smartbuild_guest";
const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEMO_SESSION_TTL_MS = 60 * 60 * 1000;
const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export class FirstPartyAuthError extends Error {
  constructor(
    public readonly code: "INVALID_REQUEST" | "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "INVALID_OTP" | "OTP_EXPIRED" | "RATE_LIMITED" | "DELIVERY_BLOCKED" | "UNAVAILABLE",
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly diagnosticCode?: Exclude<EmailDiagnosticCode, "READY">,
  ) {
    super(message);
  }
}

export function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeOtp(value: string) {
  return value.trim().replace(/\s+/g, "").replace(/\D/g, "").slice(0, 6);
}

export function validateSignupInput(email: string, password: string, name?: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw new FirstPartyAuthError("INVALID_REQUEST", "Enter a valid email address.");
  if (password.length < 12 || password.length > 128) throw new FirstPartyAuthError("INVALID_REQUEST", "Use a password between 12 and 128 characters.");
  if (name !== undefined) {
    const nextName = name.trim().replace(/\s+/g, " ");
    if (!nextName || nextName.length < 2) throw new FirstPartyAuthError("INVALID_REQUEST", "Enter your full name to continue.");
  }
}

function secretPepper() {
  return process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "smartbuild-development-only-pepper");
}

export function secretHash(value: string) {
  const pepper = secretPepper();
  if (!pepper) throw new FirstPartyAuthError("UNAVAILABLE", "Secure authentication is temporarily unavailable.");
  return crypto.createHmac("sha256", pepper).update(value).digest("hex");
}

export function createOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

const pendingSignupNames = new Map<string, string>();

function storedSignupName(email: string, fallback?: string | null) {
  const name = pendingSignupNames.get(normalizeAuthEmail(email)) || fallback || "there";
  return name.trim().replace(/\s+/g, " ");
}

function codeHash(accountId: number, purpose: "verify_email" | "password_reset", otp: string) {
  return secretHash(`${accountId}:${purpose}:${otp}`);
}

function sessionHash(token: string) {
  return secretHash(`session:${token}`);
}

function safeEqual(left: string, right: string) {
  const first = Buffer.from(left, "utf8");
  const second = Buffer.from(right, "utf8");
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function authCodeExpiry(value: Date | string | number) {
  const expiry = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(expiry) ? expiry : 0;
}

/** A demo cookie is short-lived, signed, and intentionally contains no user or account identifier. */
export function createDemoSession(now = Date.now()) {
  const expiresAt = now + DEMO_SESSION_TTL_MS;
  const payload = `demo:${expiresAt}:${crypto.randomBytes(18).toString("base64url")}`;
  return { token: `${payload}.${secretHash(`demo-session:${payload}`)}`, expiresAt: new Date(expiresAt) };
}

export function readDemoSession(token: string | null, now = Date.now()) {
  if (!token) return null;
  const marker = token.lastIndexOf(".");
  if (marker <= 0) return null;
  const payload = token.slice(0, marker);
  const signature = token.slice(marker + 1);
  const [kind, expiryText, nonce, ...extra] = payload.split(":");
  const expiresAt = Number(expiryText);
  if (kind !== "demo" || !nonce || extra.length || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + DEMO_SESSION_TTL_MS) return null;
  try {
    return safeEqual(signature, secretHash(`demo-session:${payload}`)) ? { expiresAt: new Date(expiresAt) } : null;
  } catch {
    return null;
  }
}

export function createGuestSession(userId: number, now = Date.now()) {
  const expiresAt = now + GUEST_SESSION_TTL_MS;
  const payload = `guest:${userId}:${expiresAt}:${crypto.randomBytes(18).toString("base64url")}`;
  return { token: `${payload}.${secretHash(`guest-session:${payload}`)}`, expiresAt: new Date(expiresAt) };
}

export function readGuestSession(token: string | null, now = Date.now()) {
  if (!token) return null;
  const marker = token.lastIndexOf(".");
  if (marker <= 0) return null;
  const payload = token.slice(0, marker);
  const signature = token.slice(marker + 1);
  const [kind, userIdText, expiryText, nonce, ...extra] = payload.split(":");
  const userId = Number(userIdText);
  const expiresAt = Number(expiryText);
  if (kind !== "guest" || !Number.isSafeInteger(userId) || userId <= 0 || !nonce || extra.length || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + GUEST_SESSION_TTL_MS) return null;
  try {
    return safeEqual(signature, secretHash(`guest-session:${payload}`)) ? { userId, expiresAt: new Date(expiresAt) } : null;
  } catch {
    return null;
  }
}

async function clearAuthAttemptWindow(email: string, actions: Array<"signup" | "verify_email" | "resend_verification">) {
  const subjectHash = secretHash(`rate:${email}`);
  await Promise.all(actions.map(action => clearAuthRateLimit({ action, subjectHash })));
}

async function checkRateLimit(action: "signup" | "verify_email" | "resend_verification" | "login" | "forgot_password" | "reset_password" | "smtp_send", email: string, maxAttempts: number, windowMs: number) {
  const result = await takeAuthRateLimit({ action, subjectHash: secretHash(`rate:${email}`), maxAttempts, windowMs });
  if (!result.allowed) {
    const message = action === "login"
      ? "Too many attempts. Please wait 10 seconds before trying again."
      : "Too many attempts. Please wait a few minutes before trying again.";
    throw new FirstPartyAuthError("RATE_LIMITED", message, result.retryAfterSeconds);
  }
}

async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 3, parallelism: 1 });
}

async function issueOtp(accountId: number, email: string, purpose: "verify_email" | "password_reset", name?: string): Promise<EmailDeliveryState> {
  const otp = createOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const code = await replaceAuthCode({ accountId, purpose, codeHash: codeHash(accountId, purpose, otp), expiresAt, maxAttempts: OTP_MAX_ATTEMPTS });
  if (!code) throw new FirstPartyAuthError("UNAVAILABLE", "Authentication is temporarily unavailable.");
  const delivery = await sendEmailOtp({ to: email, otp, purpose, recipientName: name });
  if (delivery.state !== "sent") {
    await consumeAuthCode(code.id);
    return delivery;
  }
  // A newly delivered code starts a fresh verification attempt window.
  await clearAuthAttemptWindow(email, ["verify_email"]);
  return delivery;
}

export async function signUpWithEmail(input: { email: string; password: string; name?: string }) {
  const email = normalizeAuthEmail(input.email);
  const fullName = input.name?.trim().replace(/\s+/g, " ") || "";
  validateSignupInput(email, input.password, fullName);
  await clearAuthAttemptWindow(email, ["signup", "verify_email", "resend_verification"]);
  pendingSignupNames.set(email, fullName);
  await checkRateLimit("signup", email, 5, 60 * 60 * 1000);
  let account = await getAuthAccountByEmail(email);
  if (account?.emailVerified) throw new FirstPartyAuthError("INVALID_REQUEST", "An account already exists for this email. Sign in instead.");
  if (!account) account = await createAuthAccount(email, await hashPassword(input.password), fullName);
  if (!account) throw new FirstPartyAuthError("UNAVAILABLE", "Authentication is temporarily unavailable.");
  if (account.displayName !== fullName) account = await updateAuthAccountDisplayName(account.id, fullName) ?? account;
  const delivery = await issueOtp(account.id, email, "verify_email", fullName);
  if (delivery.state !== "sent") throw new FirstPartyAuthError("DELIVERY_BLOCKED", "Email verification is temporarily unavailable.", undefined, delivery.diagnosticCode);
  return { email, state: "verification_required" as const };
}

export async function resendVerificationOtp(emailInput: string) {
  const email = normalizeAuthEmail(emailInput);
  const account = await getAuthAccountByEmail(email);
  if (!account || account.emailVerified) throw new FirstPartyAuthError("INVALID_REQUEST", "This verification request is not available.");
  const signupName = storedSignupName(email, account.displayName || account.email.split("@")[0]);
  pendingSignupNames.set(email, signupName);
  await checkRateLimit("resend_verification", email, 3, 60 * 60 * 1000);
  const delivery = await issueOtp(account.id, email, "verify_email", signupName);
  if (delivery.state !== "sent") throw new FirstPartyAuthError("DELIVERY_BLOCKED", "Email verification is temporarily unavailable.", undefined, delivery.diagnosticCode);
  return { email, state: "verification_required" as const };
}

async function verifyOtp(input: { email: string; otp: string; purpose: "verify_email" | "password_reset" }) {
  const email = normalizeAuthEmail(input.email);
  const otp = normalizeOtp(input.otp);
  if (!/^\d{6}$/.test(otp)) throw new FirstPartyAuthError("INVALID_OTP", "Enter the six-digit code from your email.");
  await checkRateLimit(input.purpose === "verify_email" ? "verify_email" : "reset_password", email, OTP_MAX_ATTEMPTS, OTP_TTL_MS);
  const account = await getAuthAccountByEmail(email);
  if (!account) throw new FirstPartyAuthError("INVALID_OTP", "The verification code is invalid or expired.");
  const code = await getActiveAuthCode(account.id, input.purpose);
  if (!code || authCodeExpiry(code.expiresAt) <= Date.now()) throw new FirstPartyAuthError("OTP_EXPIRED", "This code has expired. Request a new one.");
  if (code.attemptCount >= code.maxAttempts) throw new FirstPartyAuthError("RATE_LIMITED", "Too many code attempts. Request a new code.");
  const expected = Buffer.from(code.codeHash, "utf8");
  const received = Buffer.from(codeHash(account.id, input.purpose, otp), "utf8");
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    await incrementAuthCodeAttempts(code.id);
    throw new FirstPartyAuthError("INVALID_OTP", "The verification code is invalid or expired.");
  }
  await consumeAuthCode(code.id);
  return account;
}

export async function verifyEmailOtp(input: { email: string; otp: string }) {
  const email = normalizeAuthEmail(input.email);
  const account = await verifyOtp({ email, otp: input.otp, purpose: "verify_email" });
  if (account.emailVerified && account.userId) {
    pendingSignupNames.delete(email);
    return { userId: account.userId };
  }
  const signupName = storedSignupName(email, account.displayName || account.email.split("@")[0]);
  const user = await upsertUser({ openId: `smartbuild_email_${crypto.randomUUID()}`, name: signupName || account.email.split("@")[0].slice(0, 80), email: account.email, loginMethod: "email_password" });
  if (!user) throw new FirstPartyAuthError("UNAVAILABLE", "Authentication is temporarily unavailable.");
  await markAuthAccountVerified(account.id, user.id);
  pendingSignupNames.delete(email);
  return { userId: user.id };
}

export async function loginWithEmail(input: { email: string; password: string }) {
  const email = normalizeAuthEmail(input.email);
  // Keep a short cooldown for local development so a mistyped password does
  // not lock the account for many minutes.
  await checkRateLimit("login", email, 5, 10 * 1000);
  const account = await getAuthAccountByEmail(email);
  if (!account || !(await argon2.verify(account.passwordHash, input.password))) throw new FirstPartyAuthError("INVALID_CREDENTIALS", "Invalid email or password.");
  if (!account.emailVerified || !account.userId) throw new FirstPartyAuthError("EMAIL_NOT_VERIFIED", "Verify your email before signing in.");
  const token = crypto.randomBytes(32).toString("base64url");
  await createAuthSession({ id: crypto.randomUUID(), accountId: account.id, userId: account.userId, tokenHash: sessionHash(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  return { token, expiresAt: new Date(Date.now() + SESSION_TTL_MS) };
}

export async function requestPasswordReset(emailInput: string) {
  const email = normalizeAuthEmail(emailInput);
  await checkRateLimit("forgot_password", email, 3, 60 * 60 * 1000);
  const account = await getAuthAccountByEmail(email);
  if (!account?.emailVerified) return { state: "accepted" as const };
  const delivery = await issueOtp(account.id, email, "password_reset");
  if (delivery.state !== "sent") throw new FirstPartyAuthError("DELIVERY_BLOCKED", "Email verification is temporarily unavailable.", undefined, delivery.diagnosticCode);
  return { state: "accepted" as const };
}

export async function resetPasswordWithOtp(input: { email: string; otp: string; password: string }) {
  const email = normalizeAuthEmail(input.email);
  validateSignupInput(email, input.password);
  const account = await verifyOtp({ email, otp: input.otp, purpose: "password_reset" });
  await updateAuthAccountPassword(account.id, await hashPassword(input.password));
}

export async function logoutFirstPartySession(token: string | null) {
  if (token) await revokeAuthSession(sessionHash(token));
}

export function hashSessionToken(token: string) {
  return sessionHash(token);
}

export function authCookieOptions(req: Request, expiresAt?: Date) {
  return { ...getSessionCookieOptions(req), ...(expiresAt ? { expires: expiresAt } : {}) };
}
