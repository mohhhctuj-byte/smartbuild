import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "server/_core/index.ts"), "utf8");

describe("workspace General settings route", () => {
  const start = source.indexOf('app.get("/api/workspace/projects/:projectId/settings"');
  const end = source.indexOf('app.post("/api/workspace/projects/:projectId/restore"', start);
  const route = source.slice(start, end);

  it("returns only a verified publication and its actual generated website name for the project owner", () => {
    expect(route).toContain("const user = await requireUser(req, res)");
    expect(route).toContain("getProjectForUser(user.id, projectId)");
    expect(route).toContain('listProjectEvents(user.id, projectId, undefined, "build.published")');
    expect(route).toContain("loadDurableBuildRun(user.id, payload.buildRunId)");
    expect(route).toContain("run.projectId !== projectId");
    expect(route).toContain('run.status !== "succeeded"');
    expect(route).toContain("!run.preview");
    expect(route).toContain("publishedAt: event.createdAt.toISOString()");
    expect(route).toContain("websiteName: run.contract.projectName");
    expect(route).toContain("res.json({ published })");
    expect(route).toContain('res.setHeader("cache-control", "no-store")');
    expect(route).not.toContain("buildRuns[0]");
  });
});
