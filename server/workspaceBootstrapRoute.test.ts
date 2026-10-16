import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "server/_core/index.ts"), "utf8");

describe("workspace bootstrap route", () => {
  it("requires the authenticated user and uses only its user id for preparation", () => {
    const route = source.slice(source.indexOf('app.post("/api/workspace/bootstrap"'), source.indexOf('app.get("/api/workspace/selection"'));
    expect(route).toContain("const user = await requireUser(req, res)");
    expect(route).toContain("prepareWorkspaceForUser(user.id)");
    expect(route).toContain("WORKSPACE_PROVISIONING_UNAVAILABLE");
    expect(route).not.toContain("OWNER_OPEN_ID");
    expect(route).not.toContain("FIRST_PARTY_OWNER_EMAIL");
  });

  it("exposes legacy claim state only to the verified first-party account and accepts no client workspace identity", () => {
    const claimRoutes = source.slice(source.indexOf('app.get("/api/workspace/legacy-claim"'), source.indexOf('app.post("/api/personal/bootstrap"'));

    expect(claimRoutes).toContain('app.get("/api/workspace/legacy-claim"');
    expect(claimRoutes).toContain('app.post("/api/workspace/legacy-claim"');
    expect((claimRoutes.match(/requireVerifiedFirstPartyAccount\(req, res\)/g) ?? [])).toHaveLength(2);
    expect(claimRoutes).toContain("getLegacyWorkspaceClaimState(account.id)");
    expect(claimRoutes).toContain("claimLegacyWorkspaceForAccount(account.id)");
    expect(claimRoutes).toContain("res.json({ state: claim.state })");
    expect(claimRoutes).not.toContain("req.body");
    expect(claimRoutes).not.toContain("projectId");
    expect(claimRoutes).not.toContain("conversationId");
    expect(claimRoutes).not.toContain("buildRunId");
  });

  it("keeps files, previews, exports, and evaluator evidence scoped to the authenticated account", () => {
    const exportRoute = source.slice(source.indexOf('app.get("/api/cloud/export.zip"'), source.indexOf('app.get("/api/cloud/changes"'));
    const cloudFilesRoute = source.slice(source.indexOf('app.get("/api/cloud/files"'), source.indexOf('app.put("/api/cloud/file"'));
    const cloudFileRoute = source.slice(source.indexOf('app.get("/api/cloud/file"'), source.indexOf('app.put("/api/cloud/file"'));
    const filesRoute = source.slice(source.indexOf('app.get("/api/workspace/projects/:projectId/files"'), source.indexOf('app.post("/api/workspace/projects/:projectId/files"'));
    const evaluatorsRoute = source.slice(source.indexOf('app.get("/api/build-runs/:buildId/evaluators"'), source.indexOf('app.get("/api/build-runs/:buildId/bugs"'));
    const previewRoute = source.slice(source.indexOf('app.use("/api/build-runs/:buildId/preview"'), source.indexOf('app.get("/api/build-runs/:buildId/preview/status"'));

    expect(cloudFilesRoute).toContain("selectedBuildRunForRequest(user.id, requestedBuildRunId)");
    expect(cloudFilesRoute).toContain("restoreBuildWorkspace(run, buildPersistence())");
    expect(cloudFilesRoute).toContain("listBuildWorkspaceFiles(run.id)");
    expect(cloudFileRoute).toContain("selectedBuildRunForRequest(user.id, requestedBuildRunId)");
    expect(cloudFileRoute).toContain("readBuildWorkspaceFile(run.id, filePath, buildPersistence())");
    expect(exportRoute).toContain("restoreWorkspaceSelection(user.id)");
    expect(exportRoute).toContain("loadDurableBuildRun(user.id, requestedBuildRunId)");
    expect(exportRoute).toContain('run.error?.code === "BUILD_EXECUTION_MODE_REQUIRED"');
    expect(exportRoute).toContain('run.error?.code === "BUILD_EXECUTION_MODE_REQUIRED"');
    expect(filesRoute).toContain("const context = await requireProject(req, res)");
    expect(filesRoute).toContain("loadDurableBuildRun(context.user.id, requestedBuildRunId)");
    expect(evaluatorsRoute).toContain("loadDurableBuildRun(user.id, req.params.buildId)");
    expect(previewRoute).toContain("loadDurableBuildRun(user.id, req.params.buildId)");
  });

  it("exposes authenticated Build Run-scoped file edit, create, and delete routes", () => {
    const fileRoutes = source.slice(
      source.indexOf('app.get("/api/build-runs/:buildId/file"'),
      source.indexOf('app.post("/api/build-runs/:buildId/cancel"'),
    );

    expect(fileRoutes).toContain('app.put("/api/build-runs/:buildId/file"');
    expect(fileRoutes).toContain('app.delete("/api/build-runs/:buildId/file"');
    expect(fileRoutes).toContain("const user = await requireUser(req, res)");
    expect(fileRoutes).toContain("loadDurableBuildRun(user.id, req.params.buildId)");
    expect(fileRoutes).toContain("saveBuildRunWorkspaceFile");
    expect(fileRoutes).toContain("deleteBuildRunWorkspaceFile");
    expect(fileRoutes).toContain("req.body.createOnly === true");
    const publishRoute = source.slice(source.indexOf('app.post("/api/build-runs/:buildId/publish"'), source.indexOf('app.post("/published/:token/api/contact"'));
    const publishedRoute = source.slice(source.indexOf('app.use("/published/:token"'));
    expect(publishRoute).toContain("run.manualChangesPendingVerification");
    expect(publishedRoute).toContain("run.manualChangesPendingVerification");
  });

  it("does not run preview or export diagnostics for a restored Build Run blocked by a missing execution mode", () => {
    const healthRoute = source.slice(source.indexOf('app.get("/api/workspace/health"'), source.indexOf('app.get("/api/workspace/truth-engine"'));

    expect(healthRoute).toContain('run.error?.code === "BUILD_EXECUTION_MODE_REQUIRED"');
    expect(healthRoute.indexOf('run.error?.code === "BUILD_EXECUTION_MODE_REQUIRED"')).toBeLessThan(healthRoute.indexOf("await restoreBuildWorkspace(run"));
    expect(healthRoute.indexOf('run.error?.code === "BUILD_EXECUTION_MODE_REQUIRED"')).toBeLessThan(healthRoute.indexOf("await ensureBuildPreview(run"));
  });

  it("binds public diagnostics and evidence surfaces to the explicitly selected Build Run tuple", () => {
    const healthRoute = source.slice(source.indexOf('app.get("/api/workspace/health"'), source.indexOf('app.get("/api/workspace/truth-engine"'));
    const agentsRoute = source.slice(source.indexOf('app.get("/api/build-runs/:buildId/agents"'), source.indexOf('app.get("/api/build-runs/:buildId/evidence"'));
    const filesRoute = source.slice(source.indexOf('app.get("/api/build-runs/:buildId/files"'), source.indexOf('app.get("/api/build-runs/:buildId/file"'));
    const exportRoute = source.slice(source.indexOf('app.get("/api/cloud/export.zip"'), source.indexOf('app.get("/api/cloud/changes"'));

    expect(healthRoute).toContain("const requestedBuildRunId = typeof req.query.buildRunId === \"string\" && req.query.buildRunId.trim() ? req.query.buildRunId.trim() : null");
    expect(healthRoute).toContain("const restored = requestedBuildRunId ? null : await restoreWorkspaceSelection(user.id)");
    expect(healthRoute).toContain("requestedBuildRunId ? await loadDurableBuildRun(user.id, requestedBuildRunId, { forceDurable: true }) : restored?.run");
    expect(healthRoute).toContain("selectionForDiagnosticRun(restored?.selection ?? null, run)");
    expect(healthRoute.indexOf("const restored = requestedBuildRunId ? null") ).toBeLessThan(healthRoute.indexOf("await restoreBuildWorkspace(run"));
    expect(agentsRoute).toContain("loadDurableBuildRun(userId, buildId)");
    expect(agentsRoute).toContain("run ? { id: run.id, projectId: run.projectId, conversationId: run.conversationId");
    expect(filesRoute).toContain("loadDurableBuildRun(user.id, req.params.buildId)");
    expect(filesRoute).toContain("listBuildWorkspaceFiles(run.id)");
    expect(exportRoute).toContain("const requestedBuildRunId = typeof req.query.buildRunId === \"string\" ? req.query.buildRunId : null");
    expect(exportRoute).toContain("run = await loadDurableBuildRun(user.id, requestedBuildRunId)");
    expect(exportRoute).toContain("exportBuildWorkspaceZip(run.id, buildPersistence())");
  });

  it("keeps Truth Engine unavailable until the verified first-party owner binding is confirmed", () => {
    const truthRoute = source.slice(source.indexOf('app.get("/api/workspace/truth-engine"'), source.indexOf('app.put("/api/workspace/selection"'));

    expect(truthRoute).toContain("const account = await requireVerifiedFirstPartyAccount(req, res)");
    expect(truthRoute).toContain("getLegacyWorkspaceClaimState(account.id)");
    expect(truthRoute).toContain('claimState.state !== "claimed"');
    expect(truthRoute).toContain("OWNER_BINDING_REQUIRED");
    expect(truthRoute.indexOf("OWNER_BINDING_REQUIRED")).toBeLessThan(truthRoute.indexOf("const user = await requireUser(req, res)"));
    expect(truthRoute).toContain("const user = await requireUser(req, res)");
    expect(truthRoute).toContain("restoreWorkspaceSelection(user.id)");
    expect(truthRoute).toContain("const requestedBuildRunId = typeof req.query.buildRunId");
    expect(truthRoute).toContain("const requestedProjectId = numeric(req.query.projectId)");
    expect(truthRoute).toContain("const requestedConversationId = numeric(req.query.conversationId)");
    expect(truthRoute).toContain("loadDurableBuildRun(user.id, requestedBuildRunId)");
    expect(truthRoute).toContain("BUILD_RUN_TUPLE_MISMATCH");
    expect(truthRoute).toContain("evaluateTruthEngine");
    expect(truthRoute).toContain("listBuildWorkspaceFiles(run.id)");
    expect(truthRoute).toContain("exportBuildWorkspaceZip(run.id");
    expect(truthRoute).not.toContain("req.body");
    expect(truthRoute).not.toContain("OWNER_OPEN_ID");
  });

  it("loads Truth Engine from the requested durable run and rejects a mismatched tuple before evidence evaluation", () => {
    const truthRoute = source.slice(source.indexOf('app.get("/api/workspace/truth-engine"'), source.indexOf('app.put("/api/workspace/selection"'));
    expect(truthRoute.indexOf("loadDurableBuildRun(user.id, requestedBuildRunId)")).toBeLessThan(truthRoute.indexOf("evaluateTruthEngine"));
    expect(truthRoute.indexOf("BUILD_RUN_TUPLE_MISMATCH")).toBeLessThan(truthRoute.indexOf("let sourceArtifactCount = 0"));
    expect(truthRoute).toContain("run.projectId !== requestedProjectId");
    expect(truthRoute).toContain("run.conversationId !== requestedConversationId");
  });
});
