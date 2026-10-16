import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "server/_core/index.ts"), "utf8");
const dbSource = fs.readFileSync(path.join(process.cwd(), "server/db.ts"), "utf8");

describe("project API key routes", () => {
  it("requires an authenticated owner for every operation", () => {
    const start = source.indexOf('app.get("/api/projects/:projectId/secrets"');
    const end = source.indexOf('app.get("/api/build-runs/:buildId/database"', start);
    const routes = source.slice(start, end);
    expect(routes).toContain('app.post("/api/projects/:projectId/secrets"');
    expect(routes).toContain('app.put("/api/projects/:projectId/secrets/:secretId"');
    expect(routes).toContain('app.delete("/api/projects/:projectId/secrets/:secretId"');
    expect(routes.match(/requireUser\(req, res\)/g)).toHaveLength(4);
    expect(routes.match(/getProjectForUser\(user\.id, projectId\)/g)).toHaveLength(4);
  });

  it("returns metadata only and encrypts submitted values before persistence", () => {
    const start = source.indexOf('app.get("/api/projects/:projectId/secrets"');
    const end = source.indexOf('app.get("/api/build-runs/:buildId/database"', start);
    const routes = source.slice(start, end);
    expect(routes).toContain("encryptProjectSecret(req.body.value)");
    expect(routes).toContain("validProjectSecretInput(req.body)");
    expect(routes).toContain("name, provider, createdAt, updatedAt");
    expect(routes).not.toContain("res.json({ secret: { ...secret } })");
    expect(routes).toContain('res.setHeader("cache-control", "no-store")');
  });

  it("keeps API keys out of chat and blocks unverified provider builds", () => {
    const buildStart = source.indexOf('app.post("/api/build-runs"');
    const streamStart = source.indexOf('app.post("/api/ai/stream"');
    const buildRoutes = source.slice(buildStart, streamStart);
    const streamRoutes = source.slice(streamStart);
    expect(buildRoutes).toContain("containsLikelyApiSecret(requestText)");
    expect(buildRoutes).toContain("apiSecretRequirementForBuild(requestText)");
    expect(buildRoutes).toContain("No Build Run was started");
    expect(streamRoutes).toContain("historyContainsLikelyApiSecret(req.body?.messages)");
    expect(streamRoutes).toContain("An API key-like value was not accepted or saved in Chat");
  });

  it("removes encrypted API keys when their project is deleted", () => {
    expect(dbSource).toContain("secret.projectId === projectId && secret.userId === userId");
    expect(dbSource).toContain("tx.delete(projectSecrets)");
  });
});
