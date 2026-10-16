import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { analyticsViewKey, formatDuration, metricTrend, Metric, rangeForCalendarDates, rangeForPreset, WorkspaceDashboard } from "./WorkspaceDashboard";

describe("published website analytics dashboard", () => {
  it("computes the actual last-24-hours interval", () => {
    const now = new Date("2026-10-05T12:00:00.000Z");
    expect(rangeForPreset("Last 24 hours", now)).toEqual({
      from: "2026-10-04T12:00:00.000Z",
      to: "2026-10-05T12:00:00.000Z",
    });
  });

  it("uses the browser's local calendar day for Yesterday", () => {
    const now = new Date(2026, 9, 5, 12, 30, 0);
    const yesterday = new Date(2026, 9, 4);
    const today = new Date(2026, 9, 5);
    expect(rangeForPreset("Yesterday", now)).toEqual({
      from: yesterday.toISOString(),
      to: today.toISOString(),
    });
  });

  it("includes the full local date range selected in the calendar", () => {
    const from = new Date(2026, 9, 4);
    const toExclusive = new Date(2026, 9, 6);
    expect(rangeForCalendarDates("2026-10-04", "2026-10-05")).toEqual({
      from: from.toISOString(),
      to: toExclusive.toISOString(),
    });
  });

  it("keeps the selected view stable while rolling date presets refresh", () => {
    expect(analyticsViewKey("run-1", "Last 24 hours", {
      from: "2026-10-04T12:00:00.000Z",
      to: "2026-10-05T12:00:00.000Z",
    })).toBe(analyticsViewKey("run-1", "Last 24 hours", {
      from: "2026-10-04T12:00:30.000Z",
      to: "2026-10-05T12:00:30.000Z",
    }));
    expect(analyticsViewKey("run-1", "Custom", {
      from: "2026-10-04T00:00:00.000Z",
      to: "2026-10-05T00:00:00.000Z",
    })).not.toBe(analyticsViewKey("run-1", "Custom", {
      from: "2026-10-05T00:00:00.000Z",
      to: "2026-10-06T00:00:00.000Z",
    }));
  });

  it("formats measured visit durations without placeholder values", () => {
    expect(formatDuration(0)).toBe("0m 00s");
    expect(formatDuration(125)).toBe("2m 05s");
  });

  it("shows arrows only when a nonzero previous-period baseline exists", () => {
    expect(metricTrend(15, 10)).toEqual({ direction: "up", percentage: "50%" });
    expect(metricTrend(5, 10)).toEqual({ direction: "down", percentage: "50%" });
    expect(metricTrend(10, 10)).toBeNull();
    expect(metricTrend(10, 0)).toBeNull();
    expect(metricTrend(10, undefined)).toBeNull();
    expect(metricTrend(10_001, 10_000)).toEqual({ direction: "up", percentage: "<0.1%" });
  });

  it("renders comparison arrows with accessible context and omits them without a baseline", () => {
    const increasingMarkup = renderToStaticMarkup(createElement(Metric, {
      label: "Page views",
      value: "15",
      trend: metricTrend(15, 10),
    }));
    const noBaselineMarkup = renderToStaticMarkup(createElement(Metric, {
      label: "Page views",
      value: "0",
      trend: metricTrend(0, 0),
    }));
    expect(increasingMarkup).toContain("Increased 50% compared with the previous period");
    expect(increasingMarkup).toContain("50%");
    expect(noBaselineMarkup).not.toContain("compared with the previous period");
  });

  it("shows an unpublished/empty state without fabricated traffic metrics", () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceDashboard, { run: { id: "run-real", contract: { projectName: "Accessly" } } }));
    expect(markup).toContain("Accessly");
    expect(markup).toContain("Not checked");
    expect(markup).toContain("Checking publication status…");
    expect(markup).not.toContain("Website not published");
    expect(markup).toContain("Most viewed pages");
    expect(markup).toContain("Referrers");
    expect(markup).not.toContain("Documentation");
    expect(markup).not.toContain("Manage access");
    expect(markup).not.toContain("1,000");
    expect(markup).not.toContain("100%");
    expect(markup).not.toContain("Sample data");
  });

  it("provides the requested range presets without analytics filters", () => {
    const markup = renderToStaticMarkup(createElement(WorkspaceDashboard, { run: null }));
    expect(markup).toContain("Analytics");
    expect(markup).toContain("Last 24 hours");
    expect(markup).not.toContain("Filters");
    expect(markup).toContain("Refresh");
  });
});
