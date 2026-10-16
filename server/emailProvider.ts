import nodemailer, { type Transporter } from "nodemailer";

const RESEND_VERIFY_URL = "https://api.resend.com/domains";
const RESEND_SEND_URL = "https://api.resend.com/emails";
const GMAIL_SMTP_HOST = "smtp.gmail.com";
const GMAIL_SMTP_PORT = 587;

export type EmailDiagnosticCode =
  | "READY"
  | "MISSING_CONFIGURATION"
  | "DEPLOYMENT_SECRET_NOT_RELOADED"
  | "INVALID_API_KEY"
  | "UNVERIFIED_SENDER_DOMAIN"
  | "RESEND_DEV_RECIPIENT_RESTRICTED"
  | "QUOTA_OR_RATE_LIMIT"
  | "SMTP_AUTH_FAILED"
  | "SMTP_CONFIGURATION_INVALID"
  | "NETWORK_OR_PROVIDER_ERROR"
  | "PROVIDER_RESPONSE_INVALID";

/** Backward-compatible alias retained for first-party auth and diagnostic contracts. */
export type ResendDiagnosticCode = EmailDiagnosticCode;

type ReadyProviderStatus = { configured: true; state: "ready"; diagnosticCode: "READY"; missingSecrets: []; provider: "resend" | "gmail_smtp" };
type BlockedConfiguredProviderStatus = {
  configured: true;
  state: "blocked";
  diagnosticCode: Exclude<EmailDiagnosticCode, "READY" | "MISSING_CONFIGURATION" | "DEPLOYMENT_SECRET_NOT_RELOADED">;
  message: "Email verification is temporarily unavailable.";
  missingSecrets: [];
  provider: "resend" | "gmail_smtp";
};
type MissingProviderStatus = {
  configured: false;
  state: "blocked";
  diagnosticCode: "MISSING_CONFIGURATION" | "DEPLOYMENT_SECRET_NOT_RELOADED";
  message: "Verification email service is not configured";
  missingSecrets: string[];
  provider: "resend" | "gmail_smtp";
};

export type EmailProviderStatus = ReadyProviderStatus | BlockedConfiguredProviderStatus | MissingProviderStatus;

export type EmailProviderConfig = {
  resendApiKey?: string;
  emailFrom?: string;
  emailFromName?: string;
  appBaseUrl?: string;
  firstPartyOwnerEmail?: string;
  smtpUser?: string;
  smtpPassword?: string;
  smtpHost?: string;
  smtpPort?: number;
};

export type EmailDeliveryState =
  | { state: "sent"; diagnosticCode: "READY"; messageId: string }
  | { state: "blocked"; diagnosticCode: Exclude<EmailDiagnosticCode, "READY"> };

type SmtpTransport = Pick<Transporter, "verify" | "sendMail">;
type SmtpTransportFactory = (config: Required<Pick<EmailProviderConfig, "smtpUser" | "smtpPassword" | "smtpHost" | "smtpPort">>) => SmtpTransport;

export function emailProviderConfigFromEnvironment(): EmailProviderConfig {
  return {
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM,
    emailFromName: process.env.EMAIL_FROM_NAME || "SmartBuild",
    appBaseUrl: process.env.APP_BASE_URL,
    firstPartyOwnerEmail: process.env.FIRST_PARTY_OWNER_EMAIL,
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    smtpHost: process.env.SMTP_HOST || GMAIL_SMTP_HOST,
    smtpPort: Number.parseInt(process.env.SMTP_PORT || String(GMAIL_SMTP_PORT), 10),
  };
}

function hasSmtpConfiguration(config: EmailProviderConfig) {
  return Boolean(config.smtpUser?.trim() || config.smtpPassword?.trim());
}

function isTemporarySender(config: EmailProviderConfig) {
  return config.emailFrom?.trim().toLowerCase() === "onboarding@resend.dev";
}

function senderDomain(config: EmailProviderConfig) {
  return config.emailFrom?.trim().toLowerCase().split("@")[1] ?? "";
}

function genericBlocked(provider: "resend" | "gmail_smtp", diagnosticCode: BlockedConfiguredProviderStatus["diagnosticCode"]): BlockedConfiguredProviderStatus {
  return { configured: true, state: "blocked", diagnosticCode, message: "Email verification is temporarily unavailable.", missingSecrets: [], provider };
}

function missingProvider(provider: "resend" | "gmail_smtp", missingSecrets: string[]): MissingProviderStatus {
  const onlyCredentialIsAbsent = missingSecrets.length === 1 && ["RESEND_API_KEY", "SMTP_PASSWORD"].includes(missingSecrets[0]!);
  return {
    configured: false,
    state: "blocked",
    diagnosticCode: onlyCredentialIsAbsent ? "DEPLOYMENT_SECRET_NOT_RELOADED" : "MISSING_CONFIGURATION",
    message: "Verification email service is not configured",
    missingSecrets,
    provider,
  };
}

function smtpStatus(config: EmailProviderConfig): EmailProviderStatus {
  const missingSecrets = [
    !config.smtpUser?.trim() && "SMTP_USER",
    !config.smtpPassword?.trim() && "SMTP_PASSWORD",
    !config.appBaseUrl?.trim() && "APP_BASE_URL",
  ].filter((value): value is string => Boolean(value));
  if (missingSecrets.length) return missingProvider("gmail_smtp", missingSecrets);
  const smtpHost = config.smtpHost || GMAIL_SMTP_HOST;
  const smtpPort = config.smtpPort || GMAIL_SMTP_PORT;
  if (smtpHost !== GMAIL_SMTP_HOST || smtpPort !== GMAIL_SMTP_PORT) return genericBlocked("gmail_smtp", "SMTP_CONFIGURATION_INVALID");
  if (!/^[^@\s]+@gmail\.com$/i.test(config.smtpUser!.trim())) return genericBlocked("gmail_smtp", "SMTP_CONFIGURATION_INVALID");
  return { configured: true, state: "ready", diagnosticCode: "READY", missingSecrets: [], provider: "gmail_smtp" };
}

function resendStatus(config: EmailProviderConfig): EmailProviderStatus {
  const missingSecrets = [
    !config.resendApiKey?.trim() && "RESEND_API_KEY",
    !config.emailFrom?.trim() && "EMAIL_FROM",
    !config.appBaseUrl?.trim() && "APP_BASE_URL",
    isTemporarySender(config) && !config.firstPartyOwnerEmail?.trim() && "FIRST_PARTY_OWNER_EMAIL",
  ].filter((value): value is string => Boolean(value));
  if (missingSecrets.length) return missingProvider("resend", missingSecrets);
  if (!/^onboarding@resend\.dev$/i.test(config.emailFrom!.trim()) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.emailFrom!.trim())) {
    return genericBlocked("resend", "UNVERIFIED_SENDER_DOMAIN");
  }
  return { configured: true, state: "ready", diagnosticCode: "READY", missingSecrets: [], provider: "resend" };
}

export function getEmailProviderStatus(config: EmailProviderConfig = emailProviderConfigFromEnvironment()): EmailProviderStatus {
  return hasSmtpConfiguration(config) ? smtpStatus(config) : resendStatus(config);
}

function createGmailTransport(config: Required<Pick<EmailProviderConfig, "smtpUser" | "smtpPassword" | "smtpHost" | "smtpPort">>): SmtpTransport {
  return nodemailer.createTransport({ host: config.smtpHost, port: config.smtpPort, secure: false, requireTLS: true, auth: { user: config.smtpUser, pass: config.smtpPassword } });
}

function smtpTransportConfig(config: EmailProviderConfig): Required<Pick<EmailProviderConfig, "smtpUser" | "smtpPassword" | "smtpHost" | "smtpPort">> {
  return { smtpUser: config.smtpUser!.trim(), smtpPassword: config.smtpPassword!.trim(), smtpHost: config.smtpHost || GMAIL_SMTP_HOST, smtpPort: config.smtpPort || GMAIL_SMTP_PORT };
}

function smtpFailure(error: unknown): Exclude<EmailDiagnosticCode, "READY" | "MISSING_CONFIGURATION" | "DEPLOYMENT_SECRET_NOT_RELOADED"> {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  if (code === "EAUTH") return "SMTP_AUTH_FAILED";
  if (code === "EMESSAGE" || code === "EENVELOPE") return "UNVERIFIED_SENDER_DOMAIN";
  if (["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "ESOCKET"].includes(code)) return "NETWORK_OR_PROVIDER_ERROR";
  return "NETWORK_OR_PROVIDER_ERROR";
}

function senderDisplayName(config?: EmailProviderConfig) {
  return config?.emailFromName?.trim() || process.env.EMAIL_FROM_NAME?.trim() || "SmartBuild";
}

function formatSenderAddress(address: string, name = senderDisplayName()) {
  const trimmed = address.trim();
  return `${name} <${trimmed}>`;
}

async function responseDetails(response: Response) {
  try {
    return (await response.text()).toLowerCase();
  } catch {
    return "";
  }
}

function classifyResendFailure(status: number, body: string): Exclude<EmailDiagnosticCode, "READY" | "MISSING_CONFIGURATION" | "DEPLOYMENT_SECRET_NOT_RELOADED"> {
  if (status === 401 || /api key|unauthoriz/.test(body)) return "INVALID_API_KEY";
  if (status === 429 || /quota|rate.?limit/.test(body)) return "QUOTA_OR_RATE_LIMIT";
  if (/onboarding@resend\.dev|only send.*owner|recipient/.test(body)) return "RESEND_DEV_RECIPIENT_RESTRICTED";
  if (/domain|sender|from address|not verified/.test(body)) return "UNVERIFIED_SENDER_DOMAIN";
  return "NETWORK_OR_PROVIDER_ERROR";
}

function hasVerifiedSenderDomain(payload: unknown, domain: string) {
  if (!payload || typeof payload !== "object") return false;
  const data = Array.isArray((payload as { data?: unknown }).data) ? (payload as { data: unknown[] }).data : [];
  return data.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as { name?: unknown; status?: unknown };
    return typeof candidate.name === "string" && candidate.name.toLowerCase() === domain && candidate.status === "verified";
  });
}

async function verifyResendProviderNetwork(config: EmailProviderConfig, request: typeof fetch): Promise<EmailProviderStatus> {
  const status = resendStatus(config);
  if (!status.configured || status.state === "blocked") return status;
  try {
    const response = await request(RESEND_VERIFY_URL, { headers: { Authorization: `Bearer ${config.resendApiKey!}` }, signal: AbortSignal.timeout(2_500) });
    const body = await responseDetails(response);
    if (!response.ok) return genericBlocked("resend", classifyResendFailure(response.status, body));
    if (!isTemporarySender(config)) {
      const payload = body ? JSON.parse(body) : null;
      if (!hasVerifiedSenderDomain(payload, senderDomain(config))) return genericBlocked("resend", "UNVERIFIED_SENDER_DOMAIN");
    }
    return { configured: true, state: "ready", diagnosticCode: "READY", missingSecrets: [], provider: "resend" };
  } catch (error) {
    return genericBlocked("resend", error instanceof SyntaxError ? "PROVIDER_RESPONSE_INVALID" : "NETWORK_OR_PROVIDER_ERROR");
  }
}

async function verifySmtpProvider(config: EmailProviderConfig, transportFactory: SmtpTransportFactory): Promise<EmailProviderStatus> {
  const status = smtpStatus(config);
  if (!status.configured || status.state === "blocked") return status;
  try {
    await transportFactory(smtpTransportConfig(config)).verify();
    return { configured: true, state: "ready", diagnosticCode: "READY", missingSecrets: [], provider: "gmail_smtp" };
  } catch (error) {
    return genericBlocked("gmail_smtp", smtpFailure(error));
  }
}

/** Confirms the selected provider without returning credentials, provider responses, or recipients. */
export async function verifyEmailProvider(config: EmailProviderConfig = emailProviderConfigFromEnvironment(), request: typeof fetch = fetch, transportFactory: SmtpTransportFactory = createGmailTransport): Promise<EmailProviderStatus> {
  return hasSmtpConfiguration(config) ? verifySmtpProvider(config, transportFactory) : verifyResendProviderNetwork(config, request);
}

/** Backward-compatible Resend verification for existing diagnostics and tests. */
export async function verifyResendProvider(config: EmailProviderConfig = emailProviderConfigFromEnvironment(), request: typeof fetch = fetch): Promise<EmailProviderStatus> {
  return verifyResendProviderInternal(config, request);
}

async function verifyResendProviderInternal(config: EmailProviderConfig, request: typeof fetch) {
  return verifyResendProviderNetwork(config, request);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function otpEmailContent(otp: string, purpose: "verify_email" | "password_reset", recipientName?: string) {
  const title = purpose === "verify_email" ? "Verify your SmartBuild email" : "Reset your SmartBuild password";
  const action = purpose === "verify_email" ? "verification" : "password reset";
  const safeName = recipientName?.trim().replace(/\s+/g, " ") || "there";
  const greeting = `Hello ${safeName}, welcome to SmartBuild.`;
  const html = `<p>${greeting}</p><p>Your SmartBuild ${action} code is:</p><p style="font-size:28px;letter-spacing:6px;font-weight:700;line-height:1.4">${otp}</p><p>This code expires in 10 minutes. Do not share it with anyone.</p>`;
  const text = `${greeting} Your SmartBuild ${action} code is ${otp}. It expires in 10 minutes. Do not share it with anyone.`;
  return { subject: title, html, text };
}

async function sendThroughResend(input: { to: string; subject: string; html: string; text: string }, config: EmailProviderConfig, request: typeof fetch): Promise<EmailDeliveryState> {
  const status = resendStatus(config);
  if (!status.configured || status.state === "blocked") return { state: "blocked", diagnosticCode: status.diagnosticCode };
  if (isTemporarySender(config) && input.to.trim().toLowerCase() !== config.firstPartyOwnerEmail!.trim().toLowerCase()) return { state: "blocked", diagnosticCode: "RESEND_DEV_RECIPIENT_RESTRICTED" };
  try {
    const fromAddress = formatSenderAddress(config.emailFrom!.trim(), senderDisplayName(config));
    const response = await request(RESEND_SEND_URL, { method: "POST", headers: { Authorization: `Bearer ${config.resendApiKey!}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: fromAddress, to: [input.to], subject: input.subject, html: input.html, text: input.text }), signal: AbortSignal.timeout(10_000) });
    const body = await responseDetails(response);
    if (!response.ok) return { state: "blocked", diagnosticCode: classifyResendFailure(response.status, body) };
    const parsed = body ? JSON.parse(body) as { id?: unknown } : null;
    return typeof parsed?.id === "string" && parsed.id.length > 0 ? { state: "sent", diagnosticCode: "READY", messageId: parsed.id } : { state: "blocked", diagnosticCode: "PROVIDER_RESPONSE_INVALID" };
  } catch (error) {
    return { state: "blocked", diagnosticCode: error instanceof SyntaxError ? "PROVIDER_RESPONSE_INVALID" : "NETWORK_OR_PROVIDER_ERROR" };
  }
}

async function sendThroughSmtp(input: { to: string; subject: string; html: string; text: string }, config: EmailProviderConfig, transportFactory: SmtpTransportFactory): Promise<EmailDeliveryState> {
  const status = smtpStatus(config);
  if (!status.configured || status.state === "blocked") return { state: "blocked", diagnosticCode: status.diagnosticCode };
  try {
    const result = await transportFactory(smtpTransportConfig(config)).sendMail({ from: formatSenderAddress(config.smtpUser!.trim(), senderDisplayName(config)), to: input.to, subject: input.subject, html: input.html, text: input.text });
    return typeof result.messageId === "string" && result.messageId.length > 0 && Array.isArray(result.accepted) && result.accepted.length > 0
      ? { state: "sent", diagnosticCode: "READY", messageId: result.messageId }
      : { state: "blocked", diagnosticCode: "PROVIDER_RESPONSE_INVALID" };
  } catch (error) {
    return { state: "blocked", diagnosticCode: smtpFailure(error) };
  }
}

/** Sends an OTP through the selected provider; callers receive no recipient, credential, provider body, or OTP. */
export async function sendEmailOtp(input: { to: string; otp: string; purpose: "verify_email" | "password_reset"; recipientName?: string }, config: EmailProviderConfig = emailProviderConfigFromEnvironment(), request: typeof fetch = fetch, transportFactory: SmtpTransportFactory = createGmailTransport): Promise<EmailDeliveryState> {
  if (!/^\d{6}$/.test(input.otp)) return { state: "blocked", diagnosticCode: "PROVIDER_RESPONSE_INVALID" };
  const content = otpEmailContent(input.otp, input.purpose, input.recipientName);
  return hasSmtpConfiguration(config) ? sendThroughSmtp({ to: input.to, ...content }, config, transportFactory) : sendThroughResend({ to: input.to, ...content }, config, request);
}

/** Backward-compatible export that selects Resend when SMTP is not configured. */
export async function sendResendOtp(input: { to: string; otp: string; purpose: "verify_email" | "password_reset" }, config: EmailProviderConfig = emailProviderConfigFromEnvironment(), request: typeof fetch = fetch): Promise<EmailDeliveryState> {
  return sendEmailOtp(input, config, request);
}

/** Server-side provider smoke test: always targets the configured owner, contains no OTP, and succeeds only after provider acceptance. */
export async function sendEmailDiagnostic(config: EmailProviderConfig = emailProviderConfigFromEnvironment(), request: typeof fetch = fetch, transportFactory: SmtpTransportFactory = createGmailTransport): Promise<EmailDeliveryState> {
  const recipient = config.firstPartyOwnerEmail?.trim();
  if (!recipient) return { state: "blocked", diagnosticCode: "MISSING_CONFIGURATION" };
  const content = { subject: "SmartBuild email service diagnostic", html: "<p>SmartBuild verified that its email service can deliver mail.</p>", text: "SmartBuild verified that its email service can deliver mail." };
  return hasSmtpConfiguration(config) ? sendThroughSmtp({ to: recipient, ...content }, config, transportFactory) : sendThroughResend({ to: recipient, ...content }, config, request);
}

export async function sendResendDiagnosticEmail(config: EmailProviderConfig = emailProviderConfigFromEnvironment(), request: typeof fetch = fetch): Promise<EmailDeliveryState> {
  return sendEmailDiagnostic(config, request);
}
