import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const localRoutesSource = fs.readFileSync(new URL("./localRoutes.ts", import.meta.url), "utf8");
const agentRuntimeSource = fs.readFileSync(new URL("./agentRuntimeRoute.ts", import.meta.url), "utf8");
const trpcSource = fs.readFileSync(new URL("./_core/trpc.ts", import.meta.url), "utf8");

function exactRouteSection(method: "get" | "post" | "put" | "patch" | "delete" | "use", path: string) {
  const signature = `app.${method}("${path}"`;
  const start = source.indexOf(signature);
  expect(start, `Missing protected ${method.toUpperCase()} ${path}`).toBeGreaterThanOrEqual(0);
  return source.slice(start, start + 720);
}

function exactRegisteredRouteSection(registeredSource: string, method: "get" | "post", path: string) {
  const signature = `app.${method}("${path}"`;
  const start = registeredSource.indexOf(signature);
  expect(start, `Missing registered ${method.toUpperCase()} ${path}`).toBeGreaterThanOrEqual(0);
  return registeredSource.slice(start, start + 520);
}

describe("Demo Mode production-data isolation", () => {
  it("fails closed at the shared production guard before resolving a user", () => {
    const guardStart = source.indexOf("async function requireUser");
    const guard = source.slice(guardStart, guardStart + 620);
    expect(guard).toContain("if (ctx.isDemo)");
    expect(guard).toContain("res.status(403)");
    expect(guard).toContain('code: "DEMO_MODE_RESTRICTED"');
    expect(guard.indexOf("if (ctx.isDemo)")).toBeLessThan(guard.indexOf("if (!ctx.user)"));
  });

  it("routes every exact cloud, workspace, Build Run, research, upload, and AI method/path pair through the shared guard", () => {
    const protectedRoutes: Array<[Parameters<typeof exactRouteSection>[0], string]> = [
      ["get", "/api/cloud/status"], ["get", "/api/cloud/files"], ["get", "/api/cloud/file"], ["put", "/api/cloud/file"], ["delete", "/api/cloud/file"], ["post", "/api/cloud/upload"], ["get", "/api/cloud/export.zip"], ["get", "/api/cloud/changes"], ["get", "/api/cloud/logs"], ["get", "/api/cloud/diff"], ["post", "/api/cloud/rollback"],
      ["get", "/api/workspace/projects"], ["post", "/api/workspace/projects"], ["get", "/api/workspace/selection"], ["put", "/api/workspace/selection"], ["get", "/api/workspace/health"], ["get", "/api/workspace/discovery"],
      ["get", "/api/workspace/projects/:projectId/conversations"], ["post", "/api/workspace/projects/:projectId/conversations"], ["get", "/api/workspace/conversations/:conversationId/messages"], ["get", "/api/workspace/conversations/:conversationId/uploads"], ["get", "/api/workspace/projects/:projectId/files"], ["get", "/api/workspace/projects/:projectId/report.csv"], ["get", "/api/workspace/projects/:projectId/report.pdf"], ["patch", "/api/workspace/files/:fileId"], ["get", "/api/workspace/conversations/:conversationId/sources"],
      ["post", "/api/research/search"], ["post", "/api/attachments/image"], ["post", "/api/ai/plan"], ["post", "/api/ai/stream"],
      ["post", "/api/build-runs"], ["post", "/api/build-runs/:buildId/resume"], ["get", "/api/build-runs/:buildId"], ["get", "/api/build-runs/:buildId/evaluators"], ["get", "/api/build-runs/:buildId/agents"], ["get", "/api/build-runs/:buildId/bugs"], ["get", "/api/bugs/:bugId"], ["get", "/api/build-runs/:buildId/evidence"], ["get", "/api/build-runs/:buildId/files"], ["get", "/api/build-runs/:buildId/file"], ["post", "/api/build-runs/:buildId/cancel"], ["use", "/api/build-runs/:buildId/preview"],
      ["post", "/api/local/preview"], ["post", "/api/local/qa"],
    ];
    protectedRoutes.forEach(([method, path]) => expect(exactRouteSection(method, path)).toMatch(/require(?:User|Project)\(req, res\)/));
  });

  it("routes every registered local production action through the same shared guard", () => {
    ([ ["get", "/api/local/folder"], ["post", "/api/local/folder"], ["post", "/api/local/checkpoint"] ] as const)
      .forEach(([method, path]) => expect(exactRegisteredRouteSection(localRoutesSource, method, path)).toContain("deps.requireUser(req, res)"));
    expect(exactRegisteredRouteSection(agentRuntimeSource, "post", "/api/local/agents/run")).toContain("deps.requireUser(req, res)");
  });

  it("does not let a demo session become a production user through session or tRPC middleware", () => {
    expect(source).toContain('res.json({ authenticated: Boolean(context.user), authMode: context.authMode, isDemo: context.isDemo })');
    expect(source).toContain('app.post("/api/auth/demo-login"');
    expect(source).toContain('app.post("/api/auth/demo-logout"');
    expect(source).toContain("res.clearCookie(DEMO_SESSION_COOKIE");
    expect(source).toContain("DEMO_SESSION_COOKIE");
    expect(trpcSource).toContain("if (!ctx.user)");
    expect(trpcSource).toContain('code: "UNAUTHORIZED"');
  });
});
