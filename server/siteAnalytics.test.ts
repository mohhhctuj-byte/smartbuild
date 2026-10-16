import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("site analytics session tracking", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  it("aggregates unique and returning visitors and caps elapsed idle time", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smartbuild-site-analytics-"));
    temporaryDirectories.push(directory);
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AUTH_STATE_FILE", path.join(directory, "state.json"));
    vi.resetModules();
    const db = await import("./db");
    const start = new Date("2026-01-01T00:00:00.000Z");

    await db.recordSiteAnalyticsActivity({ sessionKey: "session-1", visitorKey: "visitor-1", accountId: null, ended: false, now: start });
    await db.recordSiteAnalyticsActivity({ sessionKey: "session-1", visitorKey: "visitor-1", accountId: null, ended: false, now: new Date(start.getTime() + 20_000) });
    await db.recordSiteAnalyticsActivity({ sessionKey: "session-1", visitorKey: "visitor-1", accountId: null, ended: true, now: new Date(start.getTime() + 45_000) });
    await db.recordSiteAnalyticsActivity({ sessionKey: "session-1", visitorKey: "visitor-1", accountId: null, ended: false, now: new Date(start.getTime() + 50_000) });
    await db.recordSiteAnalyticsActivity({ sessionKey: "session-1", visitorKey: "visitor-1", accountId: null, ended: true, now: new Date(start.getTime() + 80_000) });
    await db.recordSiteAnalyticsActivity({ sessionKey: "session-2", visitorKey: "visitor-1", accountId: null, ended: false, now: new Date(start.getTime() + 86_400_000) });
    await db.recordSiteAnalyticsActivity({ sessionKey: "session-2", visitorKey: "visitor-1", accountId: null, ended: true, now: new Date(start.getTime() + 86_460_000) });
    await db.recordSiteAnalyticsActivity({ sessionKey: "session-3", visitorKey: "visitor-2", accountId: null, ended: false, now: new Date(start.getTime() + 5_000) });
    await db.recordSiteAnalyticsActivity({ sessionKey: "session-3", visitorKey: "visitor-2", accountId: null, ended: true, now: new Date(start.getTime() + 300_000) });
    const user = await db.upsertUser({ openId: "analytics-test-user", name: "Nora Test", email: "nora@example.test" });
    if (!user) throw new Error("The test user could not be created.");
    const account = await db.createAuthAccount("nora@example.test", "test-password-hash", "Nora Account Name");
    if (!account) throw new Error("The test account could not be created.");
    await db.markAuthAccountVerified(account.id, user.id);
    await db.recordSiteAnalyticsActivity({ sessionKey: "session-3", visitorKey: "visitor-2", accountId: account.id, ended: false, now: new Date(start.getTime() + 300_000) });
    await db.recordSiteAnalyticsActivity({ sessionKey: "session-3", visitorKey: "visitor-2", accountId: account.id, ended: true, now: new Date(start.getTime() + 360_000) });
    const guest = await db.upsertUser({ openId: "analytics-guest-user", name: "Guest Nickname", loginMethod: "guest" });
    if (!guest) throw new Error("The guest analytics user could not be created.");
    await db.recordSiteAnalyticsActivity({ sessionKey: "guest-session-1", visitorKey: "guest-browser", accountId: null, guestUserId: guest.id, ended: true, now: new Date(start.getTime() + 400_000) });
    await db.recordSiteAnalyticsActivity({ sessionKey: "guest-session-2", visitorKey: "guest-browser", accountId: null, guestUserId: guest.id, ended: true, now: new Date(start.getTime() + 500_000) });

    const dashboard = await db.getSiteAnalyticsDashboard();
    expect(dashboard.summary).toEqual({
      uniqueVisitors: 3,
      totalSessions: 5,
      returningVisitors: 2,
      guestVisitors: 1,
      registeredVisitors: 1,
      anonymousVisitors: 1,
      registrations: 1,
      verifiedRegistrations: 1,
      averageSessionSeconds: 51,
    });
    expect(dashboard.visitors.find(visitor => visitor.key === "visitor:visitor-1")).toMatchObject({
      visits: 2,
      durationSeconds: 135,
    });
    expect(dashboard.sessions.find(session => session.key === "session-1")).toMatchObject({
      startedAt: start.toISOString(),
      lastSeenAt: new Date(start.getTime() + 80_000).toISOString(),
      endedAt: new Date(start.getTime() + 80_000).toISOString(),
      durationSeconds: 75,
    });
    expect(dashboard.sessions.find(session => session.key === "session-3")).toMatchObject({
      name: "Nora Account Name",
      email: "nora@example.test",
      type: "registered",
      durationSeconds: 120,
    });
    expect(dashboard.visitors.find(visitor => visitor.key === `guest:${guest.id}`)).toMatchObject({
      type: "guest",
      name: "Guest Nickname",
      email: null,
      visits: 2,
      durationSeconds: 0,
    });
    expect(dashboard.sessions.find(session => session.key === "guest-session-1")).toMatchObject({
      type: "guest",
      name: "Guest Nickname",
      email: null,
    });
    expect(dashboard.recentRegistrations[0]).toMatchObject({
      name: "Nora Account Name",
      email: "nora@example.test",
      verified: true,
    });
    const persisted = JSON.parse(fs.readFileSync(path.join(directory, "state.json"), "utf8"));
    expect(persisted.siteAnalyticsSessions).toHaveLength(5);
    expect(persisted.accounts.find((item: { email: string }) => item.email === "nora@example.test").displayName).toBe("Nora Account Name");

    vi.resetModules();
    const restartedDb = await import("./db");
    const restartedDashboard = await restartedDb.getSiteAnalyticsDashboard();
    expect(restartedDashboard.activityByDay).toHaveLength(2);
    expect(restartedDashboard.activityByDay).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2026-01-01", sessions: 4, visitors: 3 }),
      expect.objectContaining({ date: "2026-01-02", sessions: 1, visitors: 1 }),
    ]));
    expect(restartedDashboard.sessions.find(session => session.key === "session-3")).toMatchObject({
      name: "Nora Account Name",
      email: "nora@example.test",
      durationSeconds: 120,
    });
  });
});
