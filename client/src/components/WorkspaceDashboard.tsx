import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Globe2, RefreshCw } from "lucide-react";

type DashboardRun = { id: string; contract: { projectName: string }; manifest?: { projectVersion: number } };
type AnalyticsReport = {
  pageViews: number;
  visits: number;
  visitors: number;
  averageDurationSeconds: number;
  bounceRate: number;
  pageViewsOverTime: Array<{ timestamp: string; label: string; pageViews: number; visits: number }>;
  mostViewedPages: Array<{ label: string; visitors: number }>;
  referrers: Array<{ label: string; visitors: number }>;
  availablePaths: string[];
  availableReferrers: string[];
};
type AnalyticsComparison = Pick<AnalyticsReport, "pageViews" | "visits" | "visitors">;
type AnalyticsResponse = { buildRunId: string; published: boolean; publicUrl: string | null; comparison: AnalyticsComparison | null; analytics: AnalyticsReport };
type MetricTrend = { direction: "up" | "down"; percentage: string };
type Preset = "Today" | "Yesterday" | "Last 24 hours" | "Last 48 hours" | "Last 7 days" | "Last 14 days" | "Last 30 days" | "Last 90 days" | "Last 180 days" | "All Time" | "Custom";
type CalendarSide = "from" | "to";

const presets: Preset[] = ["Today", "Yesterday", "Last 24 hours", "Last 48 hours", "Last 7 days", "Last 14 days", "Last 30 days", "Last 90 days", "Last 180 days", "All Time"];
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateFromKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const dateLabel = (value: string) => dateFromKey(value).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
export const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export function rangeForCalendarDates(from: string, to: string) {
  const start = dateFromKey(from);
  const end = dateFromKey(to);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function analyticsViewKey(buildRunId: string | undefined, preset: Preset, range: { from: string; to: string }) {
  return JSON.stringify([buildRunId, preset, preset === "Custom" ? range.from : null, preset === "Custom" ? range.to : null]);
}

export function metricTrend(current: number, previous: number | undefined): MetricTrend | null {
  if (previous === undefined || !Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0 || current === previous) return null;
  const change = Math.abs((current - previous) / previous * 100);
  const roundedChange = Number(change.toFixed(1));
  return {
    direction: current > previous ? "up" : "down",
    percentage: roundedChange === 0 ? "<0.1%" : `${roundedChange}%`,
  };
}

export function rangeForPreset(preset: Preset, now = new Date()) {
  const today = startOfLocalDay(now);
  if (preset === "Today") return { from: today.toISOString(), to: now.toISOString() };
  if (preset === "Yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { from: yesterday.toISOString(), to: today.toISOString() };
  }
  if (preset === "Last 24 hours") return { from: new Date(now.getTime() - 86_400_000).toISOString(), to: now.toISOString() };
  if (preset === "Last 48 hours") return { from: new Date(now.getTime() - 2 * 86_400_000).toISOString(), to: now.toISOString() };
  if (preset === "All Time") {
    const earliest = new Date(today);
    earliest.setFullYear(earliest.getFullYear() - 10);
    return { from: earliest.toISOString(), to: now.toISOString() };
  }
  const days = preset === "Last 7 days" ? 7 : preset === "Last 14 days" ? 14 : preset === "Last 30 days" ? 30 : preset === "Last 90 days" ? 90 : 180;
  return { from: new Date(now.getTime() - days * 86_400_000).toISOString(), to: now.toISOString() };
}

function CalendarGrid({ month, from, to, side, onPick, onMonthChange }: {
  month: Date;
  from: string;
  to: string;
  side: CalendarSide;
  onPick: (date: string) => void;
  onMonthChange: (delta: number) => void;
}) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const firstDay = monthStart.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const selected = side === "from" ? from : to;
  return <div className="min-w-[280px] p-3">
    <div className="mb-3 flex items-center justify-between">
      <button type="button" onClick={() => onMonthChange(-1)} aria-label="Previous month" className="rounded-md p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
      <p className="text-xs font-semibold text-slate-200">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
      <button type="button" onClick={() => onMonthChange(1)} aria-label="Next month" className="rounded-md p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"><ChevronRight className="h-4 w-4" /></button>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-slate-500">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => <span key={day} className="py-1">{day}</span>)}</div>
    <div className="grid grid-cols-7 gap-1">{cells.map((day, index) => {
      if (!day) return <span key={`empty-${index}`} />;
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      const key = dateKey(date);
      const isSelected = key === selected;
      const inRange = key >= from && key <= to;
      const future = key > dateKey(new Date());
      return <button key={key} type="button" disabled={future} onClick={() => onPick(key)} className={`h-8 rounded-md text-[10px] transition disabled:cursor-not-allowed disabled:opacity-25 ${isSelected ? "bg-cyan-300 font-semibold text-slate-950" : inRange ? "bg-white/[0.07] text-slate-100" : "text-slate-400 hover:bg-white/[0.07] hover:text-white"}`}>{day}</button>;
    })}</div>
  </div>;
}

function DateRangePicker({ preset, fromDate, toDate, onPreset, onCustomRange }: {
  preset: Preset;
  fromDate: string;
  toDate: string;
  onPreset: (preset: Preset) => void;
  onCustomRange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => dateFromKey(toDate));
  const [side, setSide] = useState<CalendarSide>("from");
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);
  useEffect(() => {
    setDraftFrom(fromDate);
    setDraftTo(toDate);
    setMonth(dateFromKey(toDate));
  }, [fromDate, toDate]);
  const selectDate = (key: string) => {
    if (side === "from") {
      setDraftFrom(key);
      if (key > draftTo) setDraftTo(key);
      setSide("to");
    } else {
      if (key < draftFrom) {
        setDraftFrom(key);
        setDraftTo(draftFrom);
      } else setDraftTo(key);
    }
  };
  const apply = () => {
    const range = rangeForCalendarDates(draftFrom, draftTo);
    onCustomRange(range.from, range.to);
    setOpen(false);
  };
  return <div className="relative">
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/[0.09] bg-[#171717] px-3 text-[10px] text-slate-200 hover:border-white/[0.18]"><CalendarDays className="h-3.5 w-3.5 text-slate-400" />{preset === "Custom" ? `${dateLabel(fromDate)} – ${dateLabel(toDate)}` : preset}</button>
    {open && <div className="absolute left-0 top-10 z-30 flex max-h-[min(440px,70vh)] w-[min(650px,calc(100vw-28px))] overflow-auto rounded-xl border border-white/[0.1] bg-[#1b1b1b] shadow-2xl">
      <nav aria-label="Analytics date presets" className="w-36 shrink-0 border-r border-white/[0.08] py-2">{presets.map(item => <button key={item} type="button" onClick={() => { onPreset(item); setOpen(false); }} className={`block w-full px-3 py-2 text-left text-[10px] ${preset === item ? "bg-white/[0.08] font-medium text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"}`}>{item}</button>)}</nav>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-center gap-3 border-b border-white/[0.07] px-3 py-2 text-[9px]">
          <button type="button" onClick={() => setSide("from")} className={`rounded-md border px-2 py-1 ${side === "from" ? "border-cyan-300/30 text-cyan-100" : "border-white/[0.08] text-slate-400"}`}>From {dateLabel(draftFrom)}</button>
          <span className="text-slate-600">–</span>
          <button type="button" onClick={() => setSide("to")} className={`rounded-md border px-2 py-1 ${side === "to" ? "border-cyan-300/30 text-cyan-100" : "border-white/[0.08] text-slate-400"}`}>To {dateLabel(draftTo)}</button>
        </div>
        <CalendarGrid month={month} from={draftFrom} to={draftTo} side={side} onPick={selectDate} onMonthChange={delta => setMonth(value => new Date(value.getFullYear(), value.getMonth() + delta, 1))} />
        <div className="flex justify-end border-t border-white/[0.07] p-2"><button type="button" onClick={apply} className="rounded-md bg-cyan-200 px-3 py-1.5 text-[10px] font-semibold text-slate-950 hover:bg-cyan-100">Apply</button></div>
      </div>
    </div>}
  </div>;
}

export function Metric({ label, value, hint, trend }: { label: string; value: string; hint?: string; trend?: MetricTrend | null }) {
  const TrendIcon = trend?.direction === "up" ? ArrowUpRight : ArrowDownRight;
  const trendColor = trend?.direction === "up" ? "text-emerald-400" : "text-rose-400";
  return <div className="min-w-0 border-r border-white/[0.07] px-3 py-3 last:border-r-0">
    <p className="truncate text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    <div className="mt-1 flex items-baseline gap-1.5"><p className="truncate text-lg font-semibold tabular-nums text-slate-100">{value}</p>{trend && <span title={`${trend.direction === "up" ? "Increased" : "Decreased"} ${trend.percentage} compared with the previous period`} aria-label={`${trend.direction === "up" ? "Increased" : "Decreased"} ${trend.percentage} compared with the previous period`} className={`inline-flex items-center text-[9px] font-medium ${trendColor}`}><TrendIcon aria-hidden="true" className="h-3 w-3" />{trend.percentage}</span>}</div>
    {hint && <p className="mt-1 text-[9px] text-slate-500">{hint}</p>}
  </div>;
}

export function WorkspaceDashboard({ run, refreshKey }: { run: DashboardRun | null; refreshKey?: string | null }) {
  const [preset, setPreset] = useState<Preset>("Last 24 hours");
  const [range, setRange] = useState(() => rangeForPreset("Last 24 hours"));
  const [report, setReport] = useState<AnalyticsResponse | null>(null);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const queryKey = analyticsViewKey(run?.id, preset, range);

  const refresh = useCallback(async (signal?: AbortSignal, requestedRange = range, requestedQueryKey = queryKey, silent = false) => {
    if (!run) {
      setReport(null);
      setLoadedQueryKey(null);
      return;
    }
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    if (!silent) setLoading(true);
    const params = new URLSearchParams({ from: requestedRange.from, to: requestedRange.to });
    try {
      const response = await fetch(`/api/build-runs/${encodeURIComponent(run.id)}/analytics?${params}`, { credentials: "include", cache: "no-store", signal });
      const body = await response.json() as AnalyticsResponse | { error?: string };
      if (!response.ok) throw new Error("error" in body && body.error ? body.error : `Analytics request failed (${response.status}).`);
      if (!("analytics" in body) || body.buildRunId !== run.id) throw new Error("Analytics response does not match the current Build Run.");
      setReport(body);
      setLoadedQueryKey(requestedQueryKey);
      setError(null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Website analytics could not be loaded.");
    } finally {
      requestInFlight.current = false;
      if (!silent) setLoading(false);
    }
  }, [run?.id, refreshKey, range.from, range.to, queryKey]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!run) return;
    const timer = window.setInterval(() => {
      const liveRange = preset === "Custom" ? range : rangeForPreset(preset);
      void refresh(undefined, liveRange, queryKey, true);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [run?.id, preset, range.from, range.to, queryKey, refresh]);

  const onPreset = (value: Preset) => {
    setPreset(value);
    if (value !== "Custom") setRange(rangeForPreset(value));
  };
  const applyCustomRange = (from: string, to: string) => {
    setPreset("Custom");
    setRange({ from, to });
  };
  const refreshCurrentRange = () => {
    const currentRange = preset === "Custom" ? range : rangeForPreset(preset);
    void refresh(undefined, currentRange, queryKey);
  };
  const currentReport = loadedQueryKey === queryKey ? report : null;
  const data = currentReport?.analytics;
  const hasVisits = Boolean(data && data.pageViews > 0);
  const publicationStatus = currentReport
    ? currentReport.published ? "Published" : "Not published"
    : loading ? "Checking…" : error ? "Unavailable" : "Not checked";
  const title = run?.contract.projectName || "Website analytics";
  const url = currentReport?.publicUrl;
  const displayUrl = useMemo(() => {
    if (!url) return null;
    try { return new URL(url).host; } catch { return url; }
  }, [url]);
  const publicationSubtitle = currentReport
    ? currentReport.published ? `Website published${displayUrl ? ` · ${displayUrl}` : ""}` : "Website not published"
    : error ? "Publication status unavailable" : run ? "Checking publication status…" : "Select a Build Run";
  const selectedFromDate = dateKey(new Date(range.from));
  const selectedToDate = dateKey(new Date(new Date(range.to).getTime() - 1));

  return <section aria-label="Published website analytics" className="min-h-0 flex-1 overflow-y-scroll bg-[#0b0d12] p-3 text-slate-200 sm:p-4" style={{ scrollbarGutter: "stable", scrollbarColor: "#64748b #0b0d12" }}>
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.04]"><Globe2 className="h-4 w-4 text-slate-300" /></span>
          <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-slate-100">{title}</h2><p className="truncate text-[9px] text-slate-500">{publicationSubtitle}</p></div>
        </div>
        <div className="flex items-center gap-2">
          {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 text-[10px] text-slate-300 hover:bg-white/[0.05]"><ExternalLink className="h-3 w-3" />Open website</a>}
        </div>
      </header>

      <section aria-label="Website publication status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3">
        <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${currentReport?.published ? "bg-emerald-400" : "bg-slate-500"}`} /><p className="text-[11px] font-semibold text-slate-200">{publicationStatus}</p></div>
        <div className="flex items-center gap-2">
          {run?.manifest?.projectVersion && <span className="rounded-md border border-white/[0.08] px-2 py-1 text-[9px] text-slate-400">Version {run.manifest.projectVersion}</span>}
        </div>
      </section>

      <section aria-label="Website analytics">
        <h3 className="mb-2 text-xs font-semibold text-slate-200">Analytics</h3>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <DateRangePicker preset={preset} fromDate={selectedFromDate} toDate={selectedToDate} onPreset={onPreset} onCustomRange={applyCustomRange} />
          <button type="button" onClick={refreshCurrentRange} disabled={loading || !run} className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/[0.09] px-3 text-[10px] text-slate-300 hover:bg-white/[0.05] disabled:opacity-50"><RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />Refresh</button>
        </div>
        {error && <div role="alert" className="mb-3 rounded-lg border border-rose-300/15 bg-rose-300/[0.05] px-3 py-2 text-[10px] text-rose-100">{error}</div>}
        {!error && !report && <div aria-live="polite" className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-10 text-center text-[10px] text-slate-500">{loading ? "Loading website analytics…" : run ? "Analytics are not available yet." : "Select a Build Run to view analytics."}</div>}
        {report && data && <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0d12]">
          <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.07] sm:grid-cols-5 sm:divide-y-0">
            <Metric label="Page views" value={data.pageViews.toLocaleString()} trend={metricTrend(data.pageViews, currentReport.comparison?.pageViews)} />
            <Metric label="Visits" value={data.visits.toLocaleString()} trend={metricTrend(data.visits, currentReport.comparison?.visits)} />
            <Metric label="Visitors" value={data.visitors.toLocaleString()} trend={metricTrend(data.visitors, currentReport.comparison?.visitors)} />
            <Metric label="Duration" value={formatDuration(data.averageDurationSeconds)} hint={data.visits && !data.averageDurationSeconds ? "Waiting for visit duration data" : undefined} />
            <Metric label="Bounce rate" value={`${data.bounceRate}%`} />
          </div>
          <div className="h-56 border-t border-white/[0.07] bg-[#0b0d12] p-3">
            {hasVisits ? <ResponsiveContainer width="100%" height="100%"><LineChart data={data.pageViewsOverTime} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#737373", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} minTickGap={30} />
                <YAxis allowDecimals tickCount={5} domain={[0, "auto"]} tick={{ fill: "#737373", fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#0b0d12", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 10 }} labelStyle={{ color: "#ddd" }} />
                <Line type="monotone" dataKey="pageViews" name="Page views" stroke="#168bea" strokeWidth={1.6} dot={false} activeDot={{ r: 3, fill: "#168bea", stroke: "#0b0d12", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer> : <div className="flex h-full flex-col items-center justify-center text-center"><p className="text-xs font-medium text-slate-300">No website visits in this period</p><p className="mt-1 text-[10px] text-slate-500">Real page views will appear here after someone visits the published website.</p></div>}
          </div>
        </div>}
      </section>

      {data && <section className="grid gap-3 sm:grid-cols-2">
        <AnalyticsList title="Most viewed pages" empty="No page views recorded for this period." rows={data.mostViewedPages} column="Page" />
        <AnalyticsList title="Referrers" empty="No referring websites recorded for this period." rows={data.referrers} column="Referrer" />
      </section>}
      {!data && <section className="grid gap-3 sm:grid-cols-2">
        <AnalyticsList title="Most viewed pages" empty={error ? "Publish the website to start collecting real page views." : "Page views will appear after analytics load."} rows={[]} column="Page" />
        <AnalyticsList title="Referrers" empty={error ? "Referring websites will appear after the first published visit." : "Referrers will appear after analytics load."} rows={[]} column="Referrer" />
      </section>}
      {currentReport?.published && <p className="text-[9px] leading-4 text-slate-600">Anonymous first-party analytics. Visitor identifiers are pseudonymized before storage; IP addresses and URL query strings are not stored.</p>}
    </div>
  </section>;
}

function AnalyticsList({ title, empty, rows, column }: { title: string; empty: string; rows: Array<{ label: string; visitors: number }>; column: string }) {
  return <section className="min-h-52 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
    <h3 className="text-[10px] font-medium text-slate-300">{title}</h3>
    <div className="mt-3 grid grid-cols-[1fr_72px] border-b border-white/[0.07] pb-1.5 text-[8px] uppercase tracking-wide text-slate-500"><span>{column}</span><span className="text-right">Visitors</span></div>
    {rows.length ? <ul className="mt-1 space-y-1">{rows.map(row => <li key={row.label} className="grid grid-cols-[1fr_72px] items-center bg-white/[0.04] px-2.5 py-2 text-[10px]"><span className="truncate text-slate-300" title={row.label}>{row.label}</span><span className="text-right text-slate-400">{row.visitors.toLocaleString()}</span></li>)}</ul> : <p className="mt-3 rounded-lg bg-black/10 px-2.5 py-3 text-[9px] text-slate-500">{empty}</p>}
  </section>;
}
