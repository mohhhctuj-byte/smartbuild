import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "server/_core/index.ts"), "utf8");
const homeSource = fs.readFileSync(path.join(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
const assistantPolicy = fs.readFileSync(path.join(process.cwd(), "server/llmStream.ts"), "utf8");

describe("disabled website generation routes", () => {
  it("rejects new Build Runs, resume requests, plans, and generation mode", () => {
    const buildRoute = source.slice(source.indexOf('app.post("/api/build-runs"'), source.indexOf('app.post("/api/build-runs/:buildId/resume"'));
    const resumeRoute = source.slice(source.indexOf('app.post("/api/build-runs/:buildId/resume"'), source.indexOf('app.post("/api/scheduled/build-run-heartbeat"'));
    const planRoute = source.slice(source.indexOf('app.post("/api/ai/plan"'), source.indexOf('app.post("/api/local/preview"'));
    const streamRoute = source.slice(source.indexOf('app.post("/api/ai/stream"'), source.indexOf('app.use("/api/trpc"'));

    expect(buildRoute).toContain('respondBuildDisabled(res, "BUILD_CREATION_DISABLED"');
    expect(resumeRoute).toContain('respondBuildDisabled(res, "BUILD_EXECUTION_DISABLED"');
    expect(planRoute).toContain('respondBuildDisabled(res, "BUILD_CREATION_DISABLED"');
    expect(source).toContain("res.status(410).json({ code, error })");
    expect(streamRoute).toContain('req.body?.mode === "generate"');
    expect(streamRoute).toContain('res.status(410).json({ code: "BUILD_EXECUTION_DISABLED"');
    const buildAdvancer = source.slice(source.indexOf("async function advanceBuildRun"), source.indexOf("async function advanceAndFinalizeBuildRun"));
    expect(buildAdvancer).toContain("if (!projectImplementationEnabled()) throw new Error(\"BUILD_EXECUTION_DISABLED\")");
    expect(buildAdvancer.indexOf("if (!projectImplementationEnabled())")).toBeLessThan(buildAdvancer.indexOf("continueVerifiedBuild"));
  });

  it("stops scheduled continuation while retaining read-only routes for saved runs", () => {
    const heartbeatRoute = source.slice(source.indexOf('app.post("/api/scheduled/build-run-heartbeat"'), source.indexOf('app.get("/api/build-runs/:buildId"'));
    expect(heartbeatRoute).toContain("await removeBuildHeartbeat(run)");
    expect(heartbeatRoute).not.toContain("advanceBuildRun");
    expect(source).toContain('app.get("/api/build-runs/:buildId"');
    expect(source).toContain('app.get("/api/build-runs/:buildId/files"');
  });

  it("rejects agent execution, file mutation, and publication routes", () => {
    const agentRoute = fs.readFileSync(path.join(process.cwd(), "server/agentRuntimeRoute.ts"), "utf8");
    const cloudWrite = source.slice(source.indexOf('app.put("/api/cloud/file"'), source.indexOf('app.delete("/api/cloud/file"'));
    const cloudDelete = source.slice(source.indexOf('app.delete("/api/cloud/file"'), source.indexOf('app.post("/api/cloud/upload"'));
    const cloudUpload = source.slice(source.indexOf('app.post("/api/cloud/upload"'), source.indexOf('app.get("/api/cloud/export.zip"'));
    const cloudRollback = source.slice(source.indexOf('app.post("/api/cloud/rollback"'), source.indexOf('app.get("/api/workspace/projects"'));
    const generatedFileWrite = source.slice(source.indexOf('app.patch("/api/workspace/files/:fileId"'), source.indexOf('app.get("/api/workspace/conversations/:conversationId/sources"'));
    const publishRoute = source.slice(source.indexOf('app.post("/api/build-runs/:buildId/publish"'), source.indexOf('app.post("/published/:token/api/contact"'));
    const buildFileWrite = source.slice(source.indexOf('app.put("/api/build-runs/:buildId/file"'), source.indexOf('app.post("/api/build-runs/:buildId/cancel"'));

    expect(agentRoute).toContain('res.status(410).json({');
    expect(assistantPolicy).toContain("Chat cannot change project files");
    expect(assistantPolicy).not.toContain("website");
    expect(homeSource).not.toContain("const startBuild = async");
    expect(homeSource).not.toContain('fetch("/api/build-runs"');
    const resumeEffect = homeSource.slice(homeSource.indexOf("// A hard reload can restore"), homeSource.indexOf("const send = async"));
    expect(resumeEffect).toContain("Build execution is disabled. This saved run and its existing files remain unchanged.");
    expect(resumeEffect).not.toContain("/resume");
    for (const route of [cloudWrite, cloudDelete, cloudUpload, cloudRollback, generatedFileWrite, publishRoute, buildFileWrite]) {
      expect(route).toContain("respondBuildDisabled(res");
    }
    expect(source).toContain('app.get("/api/build-runs/:buildId/file"');
    expect(source).toContain('app.get("/api/build-runs/:buildId/files"');
  });
});
