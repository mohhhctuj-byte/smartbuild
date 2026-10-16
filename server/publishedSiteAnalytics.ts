import { createHmac } from "node:crypto";
import { z } from "zod";

const eventSchema = z.object({
  type: z.enum(["pageview", "pagehide"]),
  visitorId: z.string().regex(/^[a-f0-9-]{20,64}$/i),
  sessionId: z.string().regex(/^[a-f0-9-]{20,64}$/i),
  path: z.string().min(1).max(512).refine(value => value.startsWith("/") && !value.startsWith("//") && !/[?#\u0000-\u001f]/.test(value)),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  referrerHost: z.string().max(253).refine(value => !/[\s/@?#\u0000-\u001f]/.test(value)).optional(),
});

export type PublishedAnalyticsEvent = z.infer<typeof eventSchema>;
export type AnalyticsStoredEvent = {
  eventType: string;
  payload: string;
  createdAt: Date | string;
};

export function parsePublishedAnalyticsEvent(input: unknown) {
  return eventSchema.safeParse(input);
}

export function hashAnalyticsId(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function dateOf(event: AnalyticsStoredEvent) {
  const date = event.createdAt instanceof Date ? event.createdAt : new Date(event.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function payloadOf(event: AnalyticsStoredEvent) {
  try {
    return JSON.parse(event.payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inRange(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
}

function bucketStart(date: Date, unit: "hour" | "day" | "month") {
  const value = new Date(date);
  if (unit === "hour") value.setUTCMinutes(0, 0, 0);
  else if (unit === "day") value.setUTCHours(0, 0, 0, 0);
  else {
    value.setUTCDate(1);
    value.setUTCHours(0, 0, 0, 0);
  }
  return value;
}

function addBucket(date: Date, unit: "hour" | "day" | "month") {
  const next = new Date(date);
  if (unit === "hour") next.setUTCHours(next.getUTCHours() + 1);
  else if (unit === "day") next.setUTCDate(next.getUTCDate() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function bucketLabel(date: Date, unit: "hour" | "day" | "month") {
  return unit === "hour"
    ? date.toISOString().slice(11, 16)
    : unit === "month"
      ? date.toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" })
      : date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function aggregatePublishedAnalytics(input: {
  events: AnalyticsStoredEvent[];
  buildRunId: string;
  start: Date;
  end: Date;
  path?: string;
  referrer?: string;
}) {
  const scoped = input.events.flatMap(event => {
    if (event.eventType !== "analytics.pageview" && event.eventType !== "analytics.pagehide") return [];
    const payload = payloadOf(event);
    const date = dateOf(event);
    if (!payload || !date || payload.buildRunId !== input.buildRunId || !inRange(date, input.start, input.end)) return [];
    return [{ type: event.eventType, payload, date }];
  });

  const allPageviews = scoped.filter(event => event.type === "analytics.pageview");
  const pageviews = allPageviews.filter(event =>
    (!input.path || event.payload.path === input.path)
    && (!input.referrer || (event.payload.referrerHost || "(direct)") === input.referrer),
  );
  const selectedSessions = new Set(pageviews.flatMap(event => typeof event.payload.sessionId === "string" ? [event.payload.sessionId] : []));
  const pageHides = scoped.filter(event => event.type === "analytics.pagehide" && typeof event.payload.sessionId === "string" && selectedSessions.has(event.payload.sessionId));
  const sessions = new Map<string, { visitorId: string; pageviews: number; durationSeconds: number }>();
  const pageVisitors = new Map<string, Set<string>>();
  const referrerVisitors = new Map<string, Set<string>>();
  const availablePaths = new Set<string>();
  const availableReferrers = new Set<string>();
  for (const event of allPageviews) {
    if (typeof event.payload.path === "string") availablePaths.add(event.payload.path);
    const referrer = typeof event.payload.referrerHost === "string" && event.payload.referrerHost ? event.payload.referrerHost : "(direct)";
    availableReferrers.add(referrer);
  }

  for (const event of allPageviews) {
    const sessionId = typeof event.payload.sessionId === "string" ? event.payload.sessionId : "";
    const visitorId = typeof event.payload.visitorId === "string" ? event.payload.visitorId : "";
    if (!sessionId || !visitorId || !selectedSessions.has(sessionId)) continue;
    const session = sessions.get(sessionId) || { visitorId, pageviews: 0, durationSeconds: 0 };
    session.pageviews += 1;
    sessions.set(sessionId, session);
  }

  for (const event of pageviews) {
    const sessionId = typeof event.payload.sessionId === "string" ? event.payload.sessionId : "";
    const visitorId = typeof event.payload.visitorId === "string" ? event.payload.visitorId : "";
    if (!sessionId || !visitorId) continue;
    if (!sessions.has(sessionId)) sessions.set(sessionId, { visitorId, pageviews: 1, durationSeconds: 0 });
    const pathname = typeof event.payload.path === "string" ? event.payload.path : "/";
    const pageVisitorSet = pageVisitors.get(pathname) || new Set<string>();
    pageVisitorSet.add(visitorId);
    pageVisitors.set(pathname, pageVisitorSet);
    const referrer = typeof event.payload.referrerHost === "string" && event.payload.referrerHost ? event.payload.referrerHost : "(direct)";
    const referrerVisitorSet = referrerVisitors.get(referrer) || new Set<string>();
    referrerVisitorSet.add(visitorId);
    referrerVisitors.set(referrer, referrerVisitorSet);
  }

  for (const event of pageHides) {
    const sessionId = typeof event.payload.sessionId === "string" ? event.payload.sessionId : "";
    const session = sessions.get(sessionId);
    const duration = event.payload.durationSeconds;
    if (session && typeof duration === "number" && Number.isFinite(duration)) session.durationSeconds += duration;
  }

  const distinctVisitors = new Set(Array.from(sessions.values(), session => session.visitorId));
  const sessionsWithDuration = Array.from(sessions.values()).filter(session => session.durationSeconds > 0);
  const totalDuration = sessionsWithDuration.reduce((sum, session) => sum + session.durationSeconds, 0);
  const sessionCount = sessions.size;

  const spanMs = input.end.getTime() - input.start.getTime();
  const unit: "hour" | "day" | "month" = spanMs <= 48 * 60 * 60 * 1000 ? "hour" : spanMs <= 180 * 24 * 60 * 60 * 1000 ? "day" : "month";
  const firstBucket = bucketStart(input.start, unit);
  const series: Array<{ timestamp: string; label: string; pageViews: number; visits: number }> = [];
  const eventBuckets = new Map<string, { pageViews: number; sessions: Set<string> }>();
  for (const event of pageviews) {
    const timestamp = bucketStart(event.date, unit).toISOString();
    const bucket = eventBuckets.get(timestamp) || { pageViews: 0, sessions: new Set<string>() };
    bucket.pageViews += 1;
    if (typeof event.payload.sessionId === "string") bucket.sessions.add(event.payload.sessionId);
    eventBuckets.set(timestamp, bucket);
  }
  const bucketLimit = Math.min(400, Math.max(1, Math.ceil(spanMs / (unit === "hour" ? 3_600_000 : unit === "day" ? 86_400_000 : 30 * 86_400_000)) + 2));
  for (let cursor = firstBucket, index = 0; cursor < input.end && index < bucketLimit; cursor = addBucket(cursor, unit), index += 1) {
    const timestamp = cursor.toISOString();
    const bucket = eventBuckets.get(timestamp);
    series.push({ timestamp, label: bucketLabel(cursor, unit), pageViews: bucket?.pageViews || 0, visits: bucket?.sessions.size || 0 });
  }

  const top = (values: Map<string, Set<string>>) => Array.from(values, ([label, visitors]) => ({ label, visitors: visitors.size }))
    .sort((left, right) => right.visitors - left.visitors || left.label.localeCompare(right.label))
    .slice(0, 10);

  return {
    pageViews: pageviews.length,
    visits: sessionCount,
    visitors: distinctVisitors.size,
    averageDurationSeconds: sessionsWithDuration.length ? Math.round(totalDuration / sessionsWithDuration.length) : 0,
    bounceRate: sessionCount ? Math.round(Array.from(sessions.values()).filter(session => session.pageviews === 1).length / sessionCount * 100) : 0,
    pageViewsOverTime: series,
    mostViewedPages: top(pageVisitors),
    referrers: top(referrerVisitors),
    availablePaths: Array.from(availablePaths).sort(),
    availableReferrers: Array.from(availableReferrers).sort(),
    collectedFrom: input.start.toISOString(),
    collectedTo: input.end.toISOString(),
  };
}

export function parseAnalyticsDateRange(from: unknown, to: unknown, now = new Date()) {
  if (typeof from !== "string" || typeof to !== "string") return null;
  const parse = (value: string, isEnd: boolean) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(`${value}T00:00:00.000Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
      if (isEnd) date.setUTCDate(date.getUTCDate() + 1);
      return date;
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  };
  const start = parse(from, false);
  const end = parse(to, true);
  if (!start || !end) return null;
  if (start >= end || start > now || end.getTime() - start.getTime() > 10 * 366 * 24 * 60 * 60 * 1000) return null;
  return { start, end };
}

export function injectPublishedAnalytics(html: string, token: string) {
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) return html;
  const safeToken = JSON.stringify(token);
  const script = `<script>(function(){var t=${safeToken},p="/published/"+t+"/",e="/api/public-analytics/"+t+"/events",nativeFetch=window.fetch;window.fetch=function(input,init){if(typeof input==="string"){try{var u=new URL(input,location.href);if(u.origin===location.origin&&u.pathname==="/api/contact"){u.pathname=p+"api/contact";input=u.toString()}}catch(_){}}return nativeFetch.call(this,input,init)};function get(k,s){try{var key=k+t,v=s.getItem(key);if(!v){v=crypto.randomUUID();s.setItem(key,v)}return v}catch(_){return crypto.randomUUID()}}var v=get("smartbuild_visitor_",localStorage),s=get("smartbuild_session_",sessionStorage),started=Date.now(),sent=false;function route(){var x=location.pathname.indexOf(p)===0?location.pathname.slice(p.length):location.pathname;return "/"+x.replace(/^\\/+|\\/+$/g,"")}function send(type,duration){var body={type:type,visitorId:v,sessionId:s,path:route(),durationSeconds:duration,referrerHost:type==="pageview"&&document.referrer?new URL(document.referrer).hostname:""};try{fetch(e,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),keepalive:true,credentials:"omit"})}catch(_){}}function view(){started=Date.now();sent=false;send("pageview")}function finish(){if(sent)return;sent=true;send("pagehide",Math.min(86400,Math.max(0,Math.round((Date.now()-started)/1000))))}view();var push=history.pushState;history.pushState=function(){finish();push.apply(this,arguments);view()};addEventListener("popstate",function(){finish();view()});addEventListener("pagehide",finish);})();</script>`;
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, `${script}</body>`);
  return html.replace(/<\/html\s*>/i, `${script}</html>`);
}
