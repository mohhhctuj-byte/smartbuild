import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "server/_core/index.ts"), "utf8");
const pipeline = fs.readFileSync(path.join(process.cwd(), "server/verifiedBuildPipeline.ts"), "utf8");

describe("project database routes", () => {
  it("limits table listing to the authenticated Build Run owner and verified runs", () => {
    const start = source.indexOf('app.get("/api/build-runs/:buildId/database"');
    const end = source.indexOf('app.get("/api/build-runs/:buildId/analytics"', start);
    const routes = source.slice(start, end);
    expect(routes).toContain("const user = await requireUser(req, res)");
    expect(routes).toContain("loadDurableBuildRun(user.id, req.params.buildId)");
    expect(routes).toContain('run.status !== "succeeded"');
    expect(routes).toContain("ensureBuildPreview(run, buildPersistence())");
    expect(routes).toContain("inspectBuildRunDatabase");
    expect(routes).not.toContain("testToken");
  });

  it("validates pagination and exposes only a loopback-token-protected runtime reader", () => {
    expect(source).toContain("pageSize > 100");
    expect(pipeline).toContain('target.hostname !== "127.0.0.1"');
    expect(pipeline).toContain('"x-smartbuild-test-token": token');
    expect(pipeline).toContain('"/__smartbuild__/database/tables"');
    expect(pipeline).toContain("encodeURIComponent(tableName)");
  });
});
