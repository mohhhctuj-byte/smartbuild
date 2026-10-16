import { BarChart3, LoaderCircle, LogOut, Moon, RefreshCw, ShieldAlert, Sun } from "lucide-react";
import { type MouseEvent, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "@/contexts/ThemeContext";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type SiteAnalytics = {
  summary: {
    uniqueVisitors: number;
    totalSessions: number;
    returningVisitors: number;
    guestVisitors: number;
    registeredVisitors: number;
    anonymousVisitors: number;
    registrations: number;
    verifiedRegistrations: number;
    averageSessionSeconds: number;
  };
  visitors: Array<{ key: string; type: "registered" | "guest" | "anonymous"; name: string | null; email: string | null; firstSeenAt: string; lastSeenAt: string; visits: number; durationSeconds: number }>;
  sessions: Array<{ key: string; type: "registered" | "guest" | "anonymous"; name: string | null; email: string | null; startedAt: string; lastSeenAt: string; endedAt: string | null; durationSeconds: number }>;
  activityByDay: Array<{ date: string; sessions: number; visitors: number }>;
  recentRegistrations: Array<{ name: string | null; email: string; verified: boolean; createdAt: string }>;
};

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function visitorTypeLabel(type: SiteAnalytics["sessions"][number]["type"]) {
  if (type === "registered") return "Registered";
  if (type === "guest") return "Guest";
  return "Anonymous";
}

function VisitorTypeBadge({ type }: { type: SiteAnalytics["sessions"][number]["type"] }) {
  const color = type === "registered"
    ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-100"
    : type === "guest"
      ? "border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-100"
      : "border-white/[0.1] bg-white/[0.04] text-slate-400";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] ${color}`}>{visitorTypeLabel(type)}</span>;
}

function OwnerAnalyticsButton() {
  const [owner, setOwner] = useState(false);
  const [open, setOpen] = useState(false);
  const [dashboard, setDashboard] = useState<SiteAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/site-analytics/owner", { credentials: "include", cache: "no-store" });
      if (response.status === 403 || response.status === 401) {
        setOwner(false);
        setError("Owner access is required to view analytics.");
        return;
      }
      if (!response.ok) throw new Error("Analytics could not be loaded. Try again.");
      setDashboard(await response.json() as SiteAnalytics);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analytics could not be loaded. Try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetch("/api/site-analytics/owner", { credentials: "include", cache: "no-store" })
      .then(response => {
        if (response.ok) setOwner(true);
        else if (response.status !== 401 && response.status !== 403) console.warn(`[site-analytics] Owner access check returned ${response.status}.`);
      })
      .catch(cause => console.warn("[site-analytics] Owner access check failed.", cause));
  }, []);

  useEffect(() => {
    if (open && !dashboard && !loading) void loadDashboard();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const refreshTimer = window.setInterval(() => void loadDashboard(), 15_000);
    return () => window.clearInterval(refreshTimer);
  }, [open]);

  if (!owner) return null;
  const summaryCards = dashboard ? [
    ["Visitors", dashboard.summary.uniqueVisitors, "all access types"],
    ["Sessions", dashboard.summary.totalSessions, "tracked visits"],
    ["Guest", dashboard.summary.guestVisitors, "visitors"],
    ["Registered", dashboard.summary.registeredVisitors, "visitors"],
    ["Anonymous", dashboard.summary.anonymousVisitors, "visitors"],
    ["Avg. session", formatDuration(dashboard.summary.averageSessionSeconds), "active time"],
  ] as const : [];

  return (
    <>
      <button
        type="button"
        aria-label="Open site analytics"
        title="Site analytics dashboard"
        onClick={() => setOpen(true)}
        className="group inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-[#11141b]/95 text-slate-300 shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-300/40 hover:bg-violet-300/[0.08] hover:text-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090b12] active:scale-[0.97]"
      >
        <BarChart3 className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-x-hidden overflow-y-auto border-white/10 bg-[#0c1019] p-0 text-slate-100">
          <DialogHeader className="border-b border-white/[0.07] bg-[#111722] px-6 py-5 pr-14 text-left">
            <DialogTitle className="flex items-center gap-2 text-white"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-300/[0.08]"><BarChart3 className="h-4.5 w-4.5 text-violet-200" /></span>Site analytics dashboard</DialogTitle>
            <DialogDescription className="pl-11 text-slate-400">See who visited, whether they used Guest or a registered account, and when they were active. Anonymous visits cannot be linked to a person. No IP addresses or device fingerprints are collected.</DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-5 px-6 py-5">
            <div className="flex justify-end">
              <button type="button" onClick={() => void loadDashboard()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh data
              </button>
            </div>
            {error && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/[0.07] px-3 py-2 text-sm text-rose-100">{error}</p>}
            {loading && !dashboard && <p role="status" className="py-10 text-center text-sm text-slate-400">Loading live analytics…</p>}
            {dashboard && <>
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {summaryCards.map(([label, value, caption]) => <article key={label} className="rounded-xl border border-white/[0.07] bg-[#111722] p-4"><p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 truncate text-2xl font-semibold text-slate-100">{value}</p><p className="mt-1 text-[10px] text-slate-600">{caption}</p></article>)}
              </section>
              <section className="min-w-0 rounded-xl border border-white/[0.07] bg-[#111722] p-4">
                <div className="mb-3"><h3 className="text-sm font-semibold text-slate-200">Visitor activity</h3><p className="mt-1 text-[10px] text-slate-500">Sessions and visitors per day · last 30 days</p></div>
                {dashboard.activityByDay.length ? <div className="h-56 w-full" role="img" aria-label="Chart of daily site sessions and unique visitors">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dashboard.activityByDay} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                      <defs><linearGradient id="siteSessionsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} /><stop offset="95%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid stroke="#ffffff12" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={value => value.slice(5)} tick={{ fill: "#7c8496", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: "#7c8496", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: "#171c28", border: "1px solid #ffffff20", borderRadius: 10, color: "#e2e8f0", fontSize: 11 }} labelStyle={{ color: "#c4b5fd" }} />
                      <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#a78bfa" strokeWidth={2} fill="url(#siteSessionsFill)" dot={false} activeDot={false} />
                      <Area type="monotone" dataKey="visitors" name="Unique visitors" stroke="#67e8f9" strokeWidth={1.5} fill="transparent" dot={false} activeDot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div> : <p className="py-12 text-center text-xs text-slate-500">Daily activity will appear after real visits are recorded.</p>}
              </section>
              <section>
                <div className="mb-2 flex items-end justify-between">
                  <div><h3 className="text-sm font-semibold text-slate-200">Visitors</h3><p className="mt-1 text-[10px] text-slate-500">Guests are grouped by their guest account; anonymous visits only by browser cookie.</p></div>
                  <span className="text-[10px] text-slate-500">{dashboard.visitors.filter(visitor => visitor.visits > 1).length} returned</span>
                </div>
                <div className="max-w-full min-w-0 max-h-64 overflow-auto rounded-xl border border-white/[0.07]">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="sticky top-0 bg-[#171c28] text-slate-400"><tr><th className="px-3 py-2.5 font-medium">Person</th><th className="px-3 py-2.5 font-medium">Type</th><th className="px-3 py-2.5 font-medium">Email</th><th className="px-3 py-2.5 font-medium">Visits</th><th className="px-3 py-2.5 font-medium">Total time</th><th className="px-3 py-2.5 font-medium">First visit</th><th className="px-3 py-2.5 font-medium">Most recent visit</th><th className="px-3 py-2.5 font-medium">Returned?</th></tr></thead>
                    <tbody>{dashboard.visitors.map(visitor => <tr key={visitor.key} className={`border-t border-white/[0.06] ${visitor.visits > 1 ? "bg-violet-300/[0.035] text-slate-200" : "text-slate-300"}`}><td className="px-3 py-2.5 font-medium">{visitor.name ?? "Anonymous visitor"}</td><td className="px-3 py-2.5"><VisitorTypeBadge type={visitor.type} /></td><td className="px-3 py-2.5 text-slate-400">{visitor.email ?? "—"}</td><td className="px-3 py-2.5">{visitor.visits}</td><td className="px-3 py-2.5 font-medium">{formatDuration(visitor.durationSeconds)}</td><td className="whitespace-nowrap px-3 py-2.5">{formatDate(visitor.firstSeenAt)}</td><td className="whitespace-nowrap px-3 py-2.5">{formatDate(visitor.lastSeenAt)}</td><td className="px-3 py-2.5">{visitor.visits > 1 ? <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2 py-1 text-[10px] text-violet-100">Returned</span> : <span className="text-slate-500">First visit</span>}</td></tr>)}</tbody>
                  </table>
                  {!dashboard.visitors.length && <p className="p-5 text-center text-xs text-slate-500">No people have been recorded yet.</p>}
                </div>
              </section>
              <section>
                <div className="mb-2 flex items-end justify-between"><div><h3 className="text-sm font-semibold text-slate-200">Recent sessions</h3><p className="mt-1 text-[10px] text-slate-500">Latest 200 sessions. Exit time marked with ~ is estimated from the last activity.</p></div><span className="text-[10px] text-slate-500">{dashboard.summary.totalSessions} total</span></div>
                <div className="max-w-full min-w-0 max-h-80 overflow-auto rounded-xl border border-white/[0.07]">
                  <table className="w-full min-w-[1000px] text-left text-xs">
                    <thead className="sticky top-0 bg-[#171c28] text-slate-400"><tr><th className="px-3 py-2.5 font-medium">Person</th><th className="px-3 py-2.5 font-medium">Type</th><th className="px-3 py-2.5 font-medium">Email</th><th className="px-3 py-2.5 font-medium">Entered</th><th className="px-3 py-2.5 font-medium">Last active</th><th className="px-3 py-2.5 font-medium">Exited</th><th className="px-3 py-2.5 font-medium">Duration</th></tr></thead>
                    <tbody>{dashboard.sessions.map(session => {
                      const stale = Date.now() - new Date(session.lastSeenAt).getTime() > 60_000;
                      const exitTime = session.endedAt ?? (stale ? session.lastSeenAt : null);
                      return <tr key={session.key} className="border-t border-white/[0.06] text-slate-300"><td className="px-3 py-2.5 font-medium text-slate-200">{session.name ?? "Anonymous visitor"}</td><td className="px-3 py-2.5"><VisitorTypeBadge type={session.type} /></td><td className="px-3 py-2.5 text-slate-400">{session.email ?? "—"}</td><td className="whitespace-nowrap px-3 py-2.5">{formatDate(session.startedAt)}</td><td className="whitespace-nowrap px-3 py-2.5">{formatDate(session.lastSeenAt)}</td><td className="whitespace-nowrap px-3 py-2.5">{exitTime ? <span title={session.endedAt ? "Exit recorded by the browser" : "Estimated from the last recorded activity"}>{session.endedAt ? formatDate(exitTime) : `~ ${formatDate(exitTime)}`}</span> : <span className="text-emerald-200">Active</span>}</td><td className="px-3 py-2.5">{formatDuration(session.durationSeconds)}</td></tr>;
                    })}</tbody>
                  </table>
                  {!dashboard.sessions.length && <p className="p-5 text-center text-xs text-slate-500">No visitor sessions recorded yet.</p>}
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-200">Recent registrations</h3>
                <div className="max-w-full min-w-0 max-h-48 overflow-auto rounded-xl border border-white/[0.07]">
                  <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[#171c28] text-slate-400"><tr><th className="px-3 py-2.5 font-medium">Name</th><th className="px-3 py-2.5 font-medium">Email</th><th className="px-3 py-2.5 font-medium">Registered</th><th className="px-3 py-2.5 font-medium">Verification</th></tr></thead>
                    <tbody>{dashboard.recentRegistrations.map((account, index) => <tr key={`${account.email}-${index}`} className="border-t border-white/[0.06] text-slate-300"><td className="px-3 py-2.5">{account.name ?? "Name unavailable"}</td><td className="px-3 py-2.5">{account.email}</td><td className="whitespace-nowrap px-3 py-2.5">{formatDate(account.createdAt)}</td><td className="px-3 py-2.5">{account.verified ? "Verified" : "Pending"}</td></tr>)}</tbody>
                  </table>
                  {!dashboard.recentRegistrations.length && <p className="p-5 text-center text-xs text-slate-500">No registrations found.</p>}
                </div>
              </section>
            </>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SmartBuildLogoutButton({ showAnalytics = true }: { showAnalytics?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ remember: false }) });
      if (!response.ok) throw new Error("SIGN_OUT_UNAVAILABLE");
      window.location.assign("/");
    } catch {
      setError("Could not sign out. Try again.");
    } finally {
      setSigningOut(false);
    }
  };

  const confirmSignOut = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void signOut();
  };

  return (
    <AlertDialog
      open={confirmOpen}
      onOpenChange={(open) => {
        if (signingOut) return;
        setConfirmOpen(open);
        if (open) setError(null);
      }}
    >
      <div className="mt-auto flex w-full items-center justify-center gap-2">
        {showAnalytics && <OwnerAnalyticsButton />}
        <button
          type="button"
          aria-label={theme === "dark" ? "Use light appearance" : "Use dark appearance"}
          title={theme === "dark" ? "Use light appearance" : "Use dark appearance"}
          onClick={toggleTheme}
          className="group inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.12] bg-[#11141b]/95 text-slate-300 shadow-[0_8px_20px_rgba(0,0,0,0.22)] transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-cyan-300/[0.08] hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090b12] active:scale-[0.97]"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <AlertDialogTrigger asChild>
          <button
            type="button"
            disabled={signingOut}
            aria-label="Sign out of SmartBuild"
            aria-haspopup="dialog"
            aria-expanded={confirmOpen}
            className="group inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.14] bg-[#11141b]/95 text-slate-200 shadow-[0_12px_28px_rgba(0,0,0,0.28)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-rose-300/50 hover:bg-rose-400/[0.10] hover:text-white hover:shadow-[0_16px_34px_rgba(244,63,94,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090b12] active:scale-[0.97] disabled:cursor-wait disabled:opacity-70"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07] text-slate-300 transition duration-200 group-hover:bg-rose-300/[0.14] group-hover:text-rose-100">
              <LogOut className="h-3.5 w-3.5" />
            </span>
          </button>
        </AlertDialogTrigger>
      </div>

      <AlertDialogContent className="max-w-sm border-0 bg-[#10141f]/95 p-5 text-slate-100 shadow-none">
        <AlertDialogHeader className="gap-2 text-left">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-300/20 bg-rose-300/[0.10] text-rose-100">
            <ShieldAlert className="h-4.5 w-4.5" />
          </div>
          <AlertDialogTitle className="text-base text-slate-50">Sign out?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-6 text-slate-400">
            You will return to the sign-in screen. Your projects and saved Build Runs will stay unchanged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="status" className="rounded-lg border border-rose-300/20 bg-rose-300/[0.08] px-3 py-2 text-xs text-rose-100">{error}</p>}
        <AlertDialogFooter className="mt-1 gap-2 sm:justify-end">
          <AlertDialogCancel disabled={signingOut} className="border-white/[0.14] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08] hover:text-white">
            Stay here
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={signingOut}
            onClick={confirmSignOut}
            className="min-w-28 bg-rose-300 text-slate-950 shadow-none transition duration-200 hover:-translate-y-0.5 hover:bg-rose-200 hover:shadow-[0_10px_24px_rgba(244,63,94,0.24)] focus-visible:ring-rose-100 active:scale-[0.97]"
          >
            {signingOut ? <><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Signing out…</> : "Sign out"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
