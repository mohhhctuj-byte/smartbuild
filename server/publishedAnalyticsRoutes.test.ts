import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "server/_core/index.ts"), "utf8");

describe("published website analytics routes", () => {
  it("returns analytics only to the owner of the requested successful Build Run", () => {
    const route = source.slice(source.indexOf('app.get("/api/build-runs/:buildId/analytics"'), source.indexOf('app.post("/api/public-analytics/:token/events"'));
    expect(route).toContain("const user = await requireUser(req, res)");
    expect(route).toContain("loadDurableBuildRun(user.id, req.params.buildId)");
    expect(route).toContain('run.status !== "succeeded"');
    expect(route).toContain("listProjectEvents(user.id, run.projectId, run.conversationId)");
    expect(route).toContain('event.eventType !== "build.published"');
    expect(route).toContain("aggregatePublishedAnalytics");
  });

  it("accepts anonymous collection only for a valid publication token and stores hashed identifiers", () => {
    const route = source.slice(source.indexOf('app.post("/api/public-analytics/:token/events"'), source.indexOf('app.get("/api/build-runs/:buildId/review"'));
    expect(route).toContain("buildRunIdFromPublicationToken(req.params.token)");
    expect(route).toContain("loadPublishedBuildRun(buildRunId)");
    expect(route).toContain("parsePublishedAnalyticsEvent(req.body)");
    expect(route).toContain("hashAnalyticsId");
    expect(route).toContain("appendProjectEvent(run.userId, run.projectId");
    expect(route).toContain("req.ip || req.socket.remoteAddress");
    expect(route).not.toContain("appendProjectEvent(run.userId, run.projectId, `analytics.pageview`, { ip:");
  });

  it("instruments only published HTML responses and leaves private preview responses separate", () => {
    const publicRoute = source.slice(source.indexOf('app.use("/published/:token"'), source.indexOf('app.use("/api/build-runs/:buildId/preview"'));
    const previewRoute = source.slice(source.indexOf('app.use("/api/build-runs/:buildId/preview"'), source.indexOf("registerLocalRoutes(app"));
    expect(publicRoute).toContain("loadPublishedBuildRun(buildRunId)");
    expect(publicRoute).toContain('preview.contentType.toLowerCase().includes("text/html")');
    expect(publicRoute).toContain("injectPublishedAnalytics(html, req.params.token)");
    expect(previewRoute).not.toContain("injectPublishedAnalytics");
  });

  it("loads signed publications from user-scoped local Build Run files when durable DB storage is absent", () => {
    const helper = source.slice(source.indexOf("async function loadPublishedBuildRun"), source.indexOf("async function restoreWorkspaceSelection"));
    expect(helper).toContain("getBuildRun(buildId)");
    expect(helper).toContain("getDurableBuildRunById(buildId)");
    expect(helper).toContain("if (await getDb()) return null");
    expect(helper).toContain('readdir(localBuildRunStateRoot, { withFileTypes: true })');
    expect(helper).toContain("loadDurableBuildRun(Number(owner.name), buildId)");
    expect(helper).toContain("owner.isDirectory()");
  });
});
