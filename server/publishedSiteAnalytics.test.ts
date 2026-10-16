import { describe, expect, it } from "vitest";
import {
  aggregatePublishedAnalytics,
  hashAnalyticsId,
  injectPublishedAnalytics,
  parseAnalyticsDateRange,
  parsePublishedAnalyticsEvent,
} from "./publishedSiteAnalytics";

describe("published website analytics", () => {
  it("validates bounded, query-free page paths and ephemeral client identifiers", () => {
    expect(parsePublishedAnalyticsEvent({
      type: "pageview",
      visitorId: "f8c88f04-9eb6-4fc4-8e8e-0045316ddc96",
      sessionId: "a70f48ef-f81e-4e12-83c1-d07372c19ef2",
      path: "/products",
      referrerHost: "search.example",
    }).success).toBe(true);
    expect(parsePublishedAnalyticsEvent({
      type: "pageview",
      visitorId: "f8c88f04-9eb6-4fc4-8e8e-0045316ddc96",
      sessionId: "a70f48ef-f81e-4e12-83c1-d07372c19ef2",
      path: "/?email=person@example.com",
    }).success).toBe(false);
  });

  it("aggregates only persisted events for the selected build and date range", () => {
    const events = [
      { eventType: "analytics.pageview", payload: JSON.stringify({ buildRunId: "published-run", visitorId: "visitor-1", sessionId: "session-1", path: "/", referrerHost: "search.example" }), createdAt: new Date("2026-10-05T10:00:00Z") },
      { eventType: "analytics.pageview", payload: JSON.stringify({ buildRunId: "published-run", visitorId: "visitor-1", sessionId: "session-1", path: "/about", referrerHost: "search.example" }), createdAt: new Date("2026-10-05T10:02:00Z") },
      { eventType: "analytics.pagehide", payload: JSON.stringify({ buildRunId: "published-run", visitorId: "visitor-1", sessionId: "session-1", path: "/about", durationSeconds: 120 }), createdAt: new Date("2026-10-05T10:03:00Z") },
      { eventType: "analytics.pageview", payload: JSON.stringify({ buildRunId: "other-run", visitorId: "visitor-2", sessionId: "session-2", path: "/secret", referrerHost: "(direct)" }), createdAt: new Date("2026-10-05T10:00:00Z") },
      { eventType: "analytics.pageview", payload: JSON.stringify({ buildRunId: "published-run", visitorId: "outside-range", sessionId: "outside-range", path: "/later", referrerHost: "(direct)" }), createdAt: new Date("2026-10-06T10:00:00Z") },
    ];
    const report = aggregatePublishedAnalytics({
      events,
      buildRunId: "published-run",
      start: new Date("2026-10-05T00:00:00Z"),
      end: new Date("2026-10-06T00:00:00Z"),
    });
    expect(report).toMatchObject({
      pageViews: 2,
      visits: 1,
      visitors: 1,
      averageDurationSeconds: 120,
      bounceRate: 0,
      mostViewedPages: [{ label: "/", visitors: 1 }, { label: "/about", visitors: 1 }],
      referrers: [{ label: "search.example", visitors: 1 }],
    });
    expect(report.pageViewsOverTime.reduce((sum, point) => sum + point.pageViews, 0)).toBe(2);
  });

  it("returns factual empty counts when the selected period has no visits", () => {
    const report = aggregatePublishedAnalytics({
      events: [],
      buildRunId: "published-run",
      start: new Date("2026-10-05T00:00:00Z"),
      end: new Date("2026-10-06T00:00:00Z"),
    });
    expect(report.pageViews).toBe(0);
    expect(report.visits).toBe(0);
    expect(report.visitors).toBe(0);
    expect(report.mostViewedPages).toEqual([]);
    expect(report.referrers).toEqual([]);
    expect(report.pageViewsOverTime.every(point => point.pageViews === 0 && point.visits === 0)).toBe(true);
  });

  it("keeps session bounce and duration accurate when filtering to a page", () => {
    const events = [
      { eventType: "analytics.pageview", payload: JSON.stringify({ buildRunId: "published-run", visitorId: "visitor-1", sessionId: "session-1", path: "/", referrerHost: "search.example" }), createdAt: new Date("2026-10-05T10:00:00Z") },
      { eventType: "analytics.pageview", payload: JSON.stringify({ buildRunId: "published-run", visitorId: "visitor-1", sessionId: "session-1", path: "/about", referrerHost: "search.example" }), createdAt: new Date("2026-10-05T10:02:00Z") },
      { eventType: "analytics.pagehide", payload: JSON.stringify({ buildRunId: "published-run", visitorId: "visitor-1", sessionId: "session-1", path: "/about", durationSeconds: 120 }), createdAt: new Date("2026-10-05T10:03:00Z") },
    ];
    const report = aggregatePublishedAnalytics({
      events,
      buildRunId: "published-run",
      start: new Date("2026-10-05T00:00:00Z"),
      end: new Date("2026-10-06T00:00:00Z"),
      path: "/",
    });
    expect(report).toMatchObject({ pageViews: 1, visits: 1, visitors: 1, averageDurationSeconds: 120, bounceRate: 0 });
    expect(report.availablePaths).toEqual(["/", "/about"]);
  });

  it("injects a first-party tracker only into HTML documents", () => {
    const html = "<html><body><main>Published site</main></body></html>";
    const tracked = injectPublishedAnalytics(html, "token.signature");
    expect(tracked).toContain('e="/api/public-analytics/"+t+"/events"');
    expect(tracked).toContain('u.pathname==="/api/contact"');
    expect(tracked).toContain('u.pathname=p+"api/contact"');
    expect(tracked.indexOf("<script>")).toBeLessThan(tracked.indexOf("</body>"));
    expect(injectPublishedAnalytics("body { color: red }", "token.signature")).toBe("body { color: red }");
  });

  it("hashes visitor identifiers before they are persisted and validates date intervals", () => {
    expect(hashAnalyticsId("secret", "visitor-id")).not.toBe("visitor-id");
    expect(hashAnalyticsId("secret", "visitor-id")).toBe(hashAnalyticsId("secret", "visitor-id"));
    expect(parseAnalyticsDateRange("2026-10-05", "2026-10-05", new Date("2026-10-05T12:00:00Z"))).not.toBeNull();
    expect(parseAnalyticsDateRange("2026-02-30", "2026-03-01")).toBeNull();
    expect(parseAnalyticsDateRange("2026-10-06", "2026-10-06", new Date("2026-10-05T12:00:00Z"))).toBeNull();
  });
});
