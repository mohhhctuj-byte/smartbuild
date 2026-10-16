import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, RotateCw, ShieldCheck, Sparkles } from "lucide-react";
import { resolveAuthStatus, type AuthStatus } from "@/lib/authStatus";
import SharedSmartBuildMark from "@/components/SmartBuildMark";

type AuthMode = "login" | "signup" | "verify" | "guest";
type PublicEmailDiagnosticCode = "missing_secret" | "secret_not_reloaded" | "invalid_key" | "unverified_sender" | "resend_dev_restriction" | "quota_limit" | "invalid_smtp_credentials" | "smtp_configuration_invalid" | "network_error";

class AuthRequestError extends Error {
  constructor(message: string, public readonly diagnosticCode?: PublicEmailDiagnosticCode) { super(message); }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", headers: { "content-type": "application/json", ...(init?.headers || {}) }, ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = body as { error?: string; diagnosticCode?: PublicEmailDiagnosticCode };
    throw new AuthRequestError(payload.error || "Authentication is temporarily unavailable.", payload.diagnosticCode);
  }
  return body as T;
}

function safeAuthErrorMessage(error: unknown) {
  const fallbackBlockedMessage = "Email verification is temporarily unavailable. The form remains available. No verification code has been sent. Retry after the server email configuration is restored.";
  if (!(error instanceof AuthRequestError)) {
    if (error instanceof TypeError) return "Could not confirm the request because the connection to SmartBuild was interrupted. Check your connection and try again.";
    return "Could not complete the request. Please try again.";
  }
  const messages: Partial<Record<PublicEmailDiagnosticCode, string>> = {
    missing_secret: "Email verification is not configured on the server yet. No code was sent.",
    secret_not_reloaded: "The server has not loaded its email configuration yet. No code was sent.",
    invalid_key: "The server email credential was rejected by the provider. No code was sent.",
    unverified_sender: "The configured sender needs a verified domain before it can send verification codes.",
    resend_dev_restriction: "The temporary sender can email only its configured owner. No code was sent.",
    quota_limit: "The email provider is temporarily rate-limited. Please try again later. No code was sent.",
    invalid_smtp_credentials: "The server Gmail credentials were rejected. No code was sent.",
    smtp_configuration_invalid: "The temporary Gmail email service is not configured correctly. No code was sent.",
    network_error: "The email provider is temporarily unavailable. No code was sent.",
  };
  return error.diagnosticCode ? messages[error.diagnosticCode] || error.message : error.message || fallbackBlockedMessage;
}

function SmartBuildMark({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-3"><SharedSmartBuildMark size={compact ? 40 : 44} className="shrink-0" /><span><span className="block text-base font-semibold tracking-[-0.03em] text-white">SmartBuild</span><span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-100/55">Developer workspace</span></span></div>;
}

function AuthShell({ children, loading = false }: { children: React.ReactNode; loading?: boolean }) {
return <main className="auth-shell relative min-h-screen overflow-y-auto bg-[#02060b] text-slate-100"><div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden"><div className="auth-grid absolute inset-0 opacity-70" /><div className="auth-orb auth-orb-cyan absolute -left-28 top-[12%] h-72 w-72 rounded-full bg-[#153c67]/25" /><div className="auth-orb auth-orb-violet absolute right-[-7rem] top-[-3rem] h-80 w-80 rounded-full bg-[#101a2f]/45" /><div className="auth-orb auth-orb-blue absolute bottom-[-10rem] left-[39%] h-96 w-96 rounded-full bg-[#173553]/25" /><div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(2,6,11,0.2),rgba(3,7,15,0.92)_48%,rgba(2,6,11,0.45))]" /></div><div className={`relative mx-auto flex min-h-screen w-full max-w-[79rem] items-center px-4 py-7 sm:px-7 lg:px-10 ${loading ? "justify-center" : "lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(25rem,0.8fr)] lg:grid-cols-[minmax(0,0.98fr)_minmax(24.875rem,0.66fr)] lg:gap-[4.5rem]"}`}>{children}</div></main>;
}

export function SmartBuildAuthGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState(() => {
    try { return window.localStorage.getItem("smartbuild:last-auth-email") || ""; }
    catch { return ""; }
  });
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error" | "neutral">("neutral");
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => { let mounted = true; void resolveAuthStatus(() => api<AuthStatus>("/api/auth/status")).then(next => { if (mounted) setStatus(next); }); return () => { mounted = false; }; }, []);

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedFullName = fullName.trim().replace(/\s+/g, " ");
  const rememberEmail = (value: string) => {
    try { window.localStorage.setItem("smartbuild:last-auth-email", value); }
    catch { /* Storage may be unavailable in private browsing. */ }
  };
  const errors = useMemo(() => {
    const next: { name?: string; nickname?: string; email?: string; password?: string; otp?: string } = {};
    if (mode === "guest" && (nickname.trim().length < 2 || nickname.trim().length > 40)) next.nickname = "Use a nickname between 2 and 40 characters.";
    if (mode === "signup" && normalizedFullName.length < 2) next.name = "Enter your full name.";
    if (mode !== "guest" && !/^\S+@\S+\.\S+$/.test(normalizedEmail)) next.email = "Enter a valid email address.";
    if (mode !== "verify" && mode !== "guest" && password.length < 12) next.password = "Use at least 12 characters for your password.";
    if (mode === "verify" && !/^\d{6}$/.test(otp.trim())) next.otp = "Enter the six-digit code from your email.";
    return next;
  }, [mode, nickname, normalizedEmail, normalizedFullName, otp, password.length]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (Object.keys(errors).length) { setMessage("Review the highlighted fields and try again."); setMessageKind("error"); return; }
    setBusy(true); setMessage(null);
    try {
      if (mode === "guest") {
        await api("/api/auth/guest", { method: "POST", body: JSON.stringify({ nickname: nickname.trim().replace(/\s+/g, " ") }) });
        onAuthenticated();
      } else if (mode === "signup") {
        await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ email: normalizedEmail, password, name: normalizedFullName }) });
        rememberEmail(normalizedEmail);
        setMode("verify"); setAttempted(false); setMessage("A six-digit verification code was sent to your email."); setMessageKind("success");
      } else if (mode === "verify") {
        await api("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ email: normalizedEmail, otp: otp.trim() }) });
        rememberEmail(normalizedEmail);
        await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: normalizedEmail, password }) });
        setOtp(""); setAttempted(false); setMessage(null); onAuthenticated();
      } else {
        await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: normalizedEmail, password }) });
        rememberEmail(normalizedEmail);
        onAuthenticated();
      }
    } catch (error) { setMessage(safeAuthErrorMessage(error)); setMessageKind("error"); }
    finally { setBusy(false); }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { await api("/api/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: normalizedEmail }) }); setMessage("A new verification code has been sent."); setMessageKind("success"); }
    catch (error) { setMessage(safeAuthErrorMessage(error)); setMessageKind("error"); }
    finally { setBusy(false); }
  };
  const switchMode = (next: AuthMode) => { setMode(next); setAttempted(false); setMessage(null); setMessageKind("neutral"); };

  if (!status) return <AuthShell loading><div className="auth-card smartbuild-entrance w-full max-w-md rounded-[1.6rem] border border-[#1b324d] bg-[radial-gradient(circle_at_top,_rgba(26,61,95,0.65),_rgba(7,14,21,0.96)_60%)] p-8 text-center shadow-[0_24px_90px_rgba(0,0,0,0.65)]"><div aria-hidden className="mx-auto mb-5 h-10 w-10 rounded-2xl border border-[#284972] bg-[#0f1d2e]" /><p className="text-sm font-medium text-slate-100">Preparing secure sign-in</p><p className="mt-2 text-sm leading-6 text-slate-400">Checking the email verification service?</p></div></AuthShell>;

  const heading: Record<AuthMode, { eyebrow: string; title: string; copy: string; action: string }> = {
    login: { eyebrow: "Welcome back", title: "Sign in to SmartBuild", copy: "Continue to your private development workspace.", action: "Sign in securely" },
    signup: { eyebrow: "Create your account", title: "Create your account", copy: "Start with an email address you control.", action: "Create account" },
    verify: { eyebrow: "One more step", title: "Verify your email", copy: "Enter the six-digit code delivered to your inbox.", action: "Verify email" },
    guest: { eyebrow: "Guest access", title: "Continue as a guest", copy: "Choose a nickname to create your private guest workspace.", action: "Continue as guest" },
  };
  const active = heading[mode];
  const inputClassName = "h-12 w-full rounded-[0.85rem] border border-[#1d3556] bg-[#07131d]/90 pl-10 pr-12 text-[0.96rem] text-slate-100 outline-none transition placeholder:text-[#6d8196] focus:border-[#7db5ff]/60 focus:ring-2 focus:ring-[#7db5ff]/20 disabled:cursor-not-allowed disabled:opacity-60";
  return (
    <AuthShell>
      <section className="relative hidden self-stretch py-8 lg:flex lg:flex-col lg:justify-between">
        <div className="smartbuild-entrance">
          <SmartBuildMark />
          <div className="mt-20 max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-200/[0.055] px-3 py-1.5 text-[11px] font-medium text-cyan-50/85"><Sparkles aria-hidden size={13} />Your private build surface</div>
            <h1 className="max-w-lg text-5xl font-semibold leading-[0.96] tracking-[-0.055em] text-white">Build with focus.<br /><span className="block text-cyan-100/80">Keep the workspace yours.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-300/80">SmartBuild gives developers a protected place to direct creative work, inspect every artifact, and return to the exact workspace that matters.</p>
          </div>
        </div>
        <div className="smartbuild-entrance-delay-2 max-w-md rounded-2xl border border-white/[0.075] bg-white/[0.035] p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg border border-emerald-200/20 bg-emerald-200/[0.08] p-2 text-emerald-100"><ShieldCheck aria-hidden size={16} /></span>
            <p className="text-xs leading-5 text-slate-300"><span className="block font-semibold text-slate-100">Private first-party account</span>Your credentials are handled by SmartBuild. Email codes are short-lived and never shown before successful delivery.</p>
          </div>
        </div>
      </section>
      <section className="auth-card smartbuild-entrance relative mx-auto w-full max-w-[24.875rem] rounded-[1.6rem] border border-[#1a2f4f] bg-[radial-gradient(circle_at_top,_rgba(27,58,92,0.7),_rgba(9,16,25,0.95)_56%)] p-5 shadow-[0_28px_110px_rgba(0,0,0,0.72)] backdrop-blur-[2px] sm:p-7">
        <div className="mb-8 lg:hidden"><SmartBuildMark compact /></div>
        <>
            <header>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/75">{active.eyebrow}</p>
              <h1 className="mt-2 text-[2.05rem] font-semibold leading-[1.12] tracking-[-0.055em] text-white">{active.title}</h1>
              <p className="mt-3 text-base leading-6 text-slate-400">{active.copy}</p>
            </header>
            <form className="mt-7 space-y-4" onSubmit={submit} noValidate>
              {mode === "guest" && <label className="block text-[0.95rem] font-medium text-slate-200" htmlFor="smartbuild-guest-nickname">Nickname
                <div className="relative mt-2"><span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">✦</span><input id="smartbuild-guest-nickname" value={nickname} onChange={event => setNickname(event.target.value)} type="text" autoComplete="nickname" maxLength={40} aria-invalid={attempted && Boolean(errors.nickname)} className={`${inputClassName} pl-10 pr-3 ${attempted && errors.nickname ? "border-rose-300/55" : "border-white/[0.11]"}`} placeholder="Your nickname" /></div>
                {attempted && errors.nickname && <p className="mt-1.5 text-xs text-rose-200" role="alert">{errors.nickname}</p>}
              </label>}
              {mode === "signup" && <label className="block text-[0.95rem] font-medium text-slate-200" htmlFor="smartbuild-name">Full name
                <div className="relative mt-2"><span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">✦</span><input id="smartbuild-name" value={fullName} onChange={event => setFullName(event.target.value)} type="text" autoComplete="name" aria-invalid={attempted && Boolean(errors.name)} className={`${inputClassName} pl-10 pr-3 ${attempted && errors.name ? "border-rose-300/55" : "border-white/[0.11]"}`} placeholder="Jane Doe" /></div>
                {attempted && errors.name && <p className="mt-1.5 text-xs text-rose-200" role="alert">{errors.name}</p>}
              </label>}
              {mode !== "guest" && <label className="block text-[0.95rem] font-medium text-slate-200" htmlFor="smartbuild-email">Email address
                <div className="relative mt-2"><Mail aria-hidden size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input id="smartbuild-email" value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" inputMode="email" aria-invalid={attempted && Boolean(errors.email)} className={`${inputClassName} pl-10 pr-3 ${attempted && errors.email ? "border-rose-300/55" : "border-white/[0.11]"}`} placeholder="you@company.com" /></div>
                {attempted && errors.email && <p className="mt-1.5 text-xs text-rose-200" role="alert">{errors.email}</p>}
              </label>}
              {mode !== "verify" && mode !== "guest" && <label className="block text-[0.95rem] font-medium text-slate-200" htmlFor="smartbuild-password">Password<div className="relative mt-2"><LockKeyhole aria-hidden size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input id="smartbuild-password" value={password} onChange={event => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={12} maxLength={128} aria-invalid={attempted && Boolean(errors.password)} className={`${inputClassName} pl-10 ${attempted && errors.password ? "border-rose-300/55" : "border-white/[0.11]"}`} placeholder="At least 12 characters" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-200/45" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div><span className="mt-1.5 block text-xs font-normal text-slate-500">Use 12 or more characters.</span>{attempted && errors.password && <p className="mt-1.5 text-xs text-rose-200" role="alert">{errors.password}</p>}</label>}
              {mode === "verify" && <label className="block text-sm font-medium text-slate-200" htmlFor="smartbuild-otp">Six-digit code<div className="relative mt-2"><KeyRound aria-hidden size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input id="smartbuild-otp" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" aria-invalid={attempted && Boolean(errors.otp)} className={`${inputClassName} px-10 text-center font-mono tracking-[0.45em] ${attempted && errors.otp ? "border-rose-300/55" : "border-white/[0.11]"}`} placeholder="000000" /></div>{attempted && errors.otp && <p className="mt-1.5 text-xs text-rose-200" role="alert">{errors.otp}</p>}</label>}
              <button disabled={busy} className="group mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[0.9rem] bg-gradient-to-r from-[#1d3d65] via-[#214d80] to-[#0d1c2d] px-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(26,78,130,0.45)] transition duration-200 hover:from-[#234d7f] hover:via-[#295a93] hover:to-[#12273b] focus:outline-none focus:ring-4 focus:ring-blue-300/20 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]">{busy ? <RotateCw aria-hidden size={16} className="animate-spin" /> : <>{active.action}<ArrowRight aria-hidden size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" /></>}</button>
            </form>
            {message && <div role={messageKind === "error" ? "alert" : "status"} aria-live="polite" className={`mt-4 rounded-xl border px-3.5 py-3 text-sm leading-5 ${messageKind === "error" ? "border-rose-300/20 bg-rose-300/[0.07] text-rose-100" : messageKind === "success" ? "border-emerald-200/20 bg-emerald-200/[0.07] text-emerald-50" : "border-white/[0.09] bg-white/[0.04] text-slate-300"}`}>{messageKind === "success" && <CheckCircle2 aria-hidden size={15} className="mr-1.5 inline-block -mt-0.5 text-emerald-100" />}{message}</div>}
            <nav aria-label="Authentication actions" className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm"><button type="button" onClick={() => switchMode(mode === "login" || mode === "guest" ? "signup" : "login")} className="font-semibold text-cyan-200 underline-offset-4 transition hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200">{mode === "signup" || mode === "verify" ? "Already verified? Sign in" : "Create account"}</button>{mode === "login" && <button type="button" onClick={() => switchMode("guest")} className="font-semibold text-slate-300 underline-offset-4 transition hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200">Guest</button>}{mode === "guest" && <button type="button" onClick={() => switchMode("login")} className="font-semibold text-slate-300 underline-offset-4 transition hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200">Back to sign in</button>}{mode === "verify" && <button type="button" disabled={busy} onClick={() => void resend()} className="inline-flex items-center gap-1.5 text-slate-400 transition hover:text-slate-100 disabled:opacity-60"><RotateCw aria-hidden size={13} />Resend code</button>}</nav>
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-white/[0.075] bg-white/[0.025] p-3 text-xs leading-5 text-slate-300"><ShieldCheck aria-hidden size={15} className="mt-0.5 shrink-0 text-cyan-100/75" /><span><span className="block font-semibold text-slate-100">{mode === "guest" ? "Private guest workspace" : "Private first-party account"}</span>{mode === "guest" ? "Your guest workspace is separate from other users and available on this browser for up to 30 days." : "SmartBuild uses secure server-side sessions. No social sign-in or secret fields are shown here."}</span></div>
        </>
      </section>
    </AuthShell>
  );
}
