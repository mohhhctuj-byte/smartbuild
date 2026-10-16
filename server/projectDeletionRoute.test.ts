import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = fs.readFileSync(path.join(process.cwd(), "server/_core/index.ts"), "utf8");
const dbSource = fs.readFileSync(path.join(process.cwd(), "server/db.ts"), "utf8");
const discoverySource = fs.readFileSync(path.join(process.cwd(), "client/src/components/SmartBuildDiscovery.tsx"), "utf8");
const homeSource = fs.readFileSync(path.join(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
const sidebarDeleteSource = fs.readFileSync(path.join(process.cwd(), "client/src/components/WorkspaceListDeleteControl.tsx"), "utf8");

describe("owner-scoped project deletion", () => {
  it("requires the authenticated owner, rejects an unknown project, and only removes a trusted workspace root", () => {
    const route = serverSource.slice(serverSource.indexOf('app.delete("/api/workspace/projects/:projectId"'), serverSource.indexOf('app.get("/api/workspace/projects/:projectId/conversations"'));

    expect(route).toContain("const user = await requireUser(req, res)");
    expect(route).toContain("const projectId = numeric(req.params.projectId)");
    expect(route).toContain("const selection = await getWorkspaceSelection(user.id)");
    expect(route).toContain("listDurableBuildRuns(user.id, projectId)");
    expect(route).toContain("listLocalBuildRunCandidates(user.id, projectId)");
    expect(route).toContain("activeBuildSteps.get(run.id)");
    expect(route).toContain('cancelTimedOutBuild(run.id, undefined, "Workspace deleted by user.")');
    expect(route).toContain("deleteProjectForUser(user.id, projectId)");
    expect(route).toContain("forgetBuildRun(run.id)");
    expect(route).toContain("localBuildRunStatePath(user.id, run.id)");
    expect(route).toContain('res.status(404).json({ error: "Project not found." })');
    expect(route).toContain("buildWorkspacePath(user.id, projectId)");
    expect(route).toContain("recursive: true, force: true");
    expect(route).toContain('res.status(409).json({ error: "The selected workspace could not be deleted safely. Please retry." })');
    expect(route).not.toContain("Wait for the workspace's active Build Runs to finish before deleting it.");
    expect(route).toContain("Promise.allSettled(activeSteps).then(cleanupBuildRuns)");
    expect(route.indexOf("await rm(buildWorkspacePath(user.id, projectId)")).toBeLessThan(route.indexOf("Promise.allSettled(activeSteps).then(cleanupBuildRuns)"));
    expect(route).not.toContain("req.body");
    expect(route).not.toContain("workspaceRoot");
    expect(route).toContain("selection?.projectId === deleted.projectId");
  });

  it("deletes only dependent records within the owner and project scope before the project row", () => {
    const deletion = dbSource.slice(dbSource.indexOf("export async function deleteProjectForUser"), dbSource.indexOf("export type ProjectBuildStatus"));

    expect(deletion).toContain("eq(projects.id, projectId), eq(projects.userId, userId)");
    expect(deletion).toContain("eq(buildRuns.projectId, projectId), eq(buildRuns.userId, userId)");
    expect(deletion).toContain("tx.delete(buildRunAgentTasks)");
    expect(deletion).toContain("tx.delete(buildRunReviews)");
    expect(deletion).toContain("tx.delete(generatedFiles)");
    expect(deletion).toContain("tx.delete(projectEvents)");
    expect(deletion).toContain("tx.delete(researchSources)");
    expect(deletion).toContain("tx.delete(uploads)");
    expect(deletion).toContain("tx.delete(messages)");
    expect(deletion).toContain("tx.delete(conversations)");
    expect(deletion).toContain("tx.delete(workspaceSelections)");
    expect(deletion).toContain("inArray(workspaceSelections.conversationId, conversationIds)");
    expect(deletion).toContain("inArray(workspaceSelections.buildRunId, runIds)");
    expect(deletion).toContain("eq(workspaceSelections.userId, userId)");
    expect(deletion).toContain("tx.delete(projects)");
    expect(deletion.indexOf("tx.delete(workspaceSelections)")).toBeLessThan(deletion.indexOf("tx.delete(conversations)"));
    expect(deletion.indexOf("tx.delete(buildRunReviews)")).toBeLessThan(deletion.indexOf("tx.delete(buildRuns)"));
    expect(deletion.indexOf("tx.delete(buildRuns)")).toBeLessThan(deletion.indexOf("tx.delete(projects)"));
    expect(deletion.indexOf("tx.delete(conversations)")).toBeLessThan(deletion.indexOf("tx.delete(projects)"));
    expect(deletion).toContain("memoryAuthState.messagesById");
    expect(deletion).toContain("memoryAuthState.projectEventsById");
  });

  it("requires a visible irreversible confirmation and clears the active client selection only after the DELETE succeeds", () => {
    expect(discoverySource).toContain("Delete project permanently?");
    expect(discoverySource).toContain("This cannot be undone.");
    expect(discoverySource).toContain('method: "DELETE", credentials: "include"');
    expect(discoverySource).toContain('disabled={deleting}');
    expect(discoverySource).toContain('{!archivedView && <button type="button" onClick={() => detailProject && setDeleteCandidate(detailProject)}');
    expect(discoverySource.indexOf("if (!response.ok)")).toBeLessThan(discoverySource.indexOf("onProjectDeleted(project.id)"));
    expect(homeSource).toContain('window.addEventListener("smartbuild:project-deleted", projectDeleted)');
    expect(homeSource).toContain("if (projectId !== deletedProjectId) return");
    expect(homeSource).toContain("setConversationId(null)");
    expect(homeSource).toContain("setBuildRun(null)");
    expect(homeSource).toContain("Project deleted. Select another workspace or create a new one.");
    expect(homeSource).toContain('import { WorkspaceListDeleteControl } from "@/components/WorkspaceListDeleteControl"');
    expect(homeSource).toContain('<WorkspaceListDeleteControl projectId={project.id} projectName={project.name} />');
    expect(sidebarDeleteSource).toContain('method: "DELETE", credentials: "include"');
    expect(sidebarDeleteSource).toContain("await response.json().catch(() => null)");
    expect(sidebarDeleteSource).toContain("The selected workspace could not be deleted. Please retry.");
    expect(sidebarDeleteSource).toContain("SmartBuild could not be reached, so deletion was not confirmed.");
    expect(sidebarDeleteSource).toContain('error ? "Retry deletion" : "Delete permanently"');
    expect(sidebarDeleteSource).toContain("Delete workspace permanently?");
    expect(sidebarDeleteSource).toContain("This cannot be undone.");
    expect(sidebarDeleteSource).toContain('disabled={deleting}');
    expect(sidebarDeleteSource).toContain('role="status"');
    expect(sidebarDeleteSource).toContain("Deleting saved project data safely.");
    expect(sidebarDeleteSource).toContain("keep this window open.");
    expect(sidebarDeleteSource.indexOf("if (!response.ok)")).toBeLessThan(sidebarDeleteSource.indexOf('window.dispatchEvent(new CustomEvent("smartbuild:project-deleted"'));
  });
});
