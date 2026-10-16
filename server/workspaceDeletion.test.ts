import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorkspacePath } from "./verifiedBuildPipeline";
import { executeWorkspaceDeletion, isWorkspaceDeletionRequest } from "./workspaceDeletion";

describe("workspace deletion intent", () => {
  it("recognizes explicit Arabic requests to clear generated code", () => {
    expect(isWorkspaceDeletionRequest("امسح الأكواد وكل اللي عملته")).toBe(true);
    expect(isWorkspaceDeletionRequest("امسح كل ما عملته، وابدأ من جديد")).toBe(true);
  });

  it("recognizes explicit English requests to remove generated files", () => {
    expect(isWorkspaceDeletionRequest("Delete all code and files I made in this workspace")).toBe(true);
  });

  it("does not treat negated or unrelated requests as deletion", () => {
    expect(isWorkspaceDeletionRequest("Don't delete the code")).toBe(false);
    expect(isWorkspaceDeletionRequest("Make the buttons blue")).toBe(false);
  });

  it("clears the selected Build Run workspace without deleting the project root", async () => {
    const run = {
      id: "deletion-test-run",
      userId: 901,
      projectId: 902,
      conversationId: 903,
      workspaceRoot: buildWorkspacePath(901, 902, "deletion-test-run"),
      artifacts: [{ path: "index.html", size: 18 }],
    } as Parameters<typeof executeWorkspaceDeletion>[0]["run"];
    if (!run) throw new Error("Test Build Run was not created.");
    await mkdir(run.workspaceRoot, { recursive: true });
    await writeFile(path.join(run.workspaceRoot, "index.html"), "<h1>Generated</h1>", "utf8");

    const result = await executeWorkspaceDeletion({
      userId: run.userId,
      projectId: run.projectId,
      conversationId: run.conversationId,
      run,
      saveSelection: async () => undefined,
    });

    await expect(readFile(path.join(run.workspaceRoot, "index.html"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(result.scope).toBe("build-run");
    expect(result.buildRunId).toBe(run.id);
  });

  it("removes an orphaned workspace when the selection no longer has a Build Run", async () => {
    const userId = 903;
    const projectId = 904;
    const conversationId = 905;
    const orphanId = "orphan-deletion-test";
    const projectRoot = path.dirname(buildWorkspacePath(userId, projectId, "scan"));
    const orphanRoot = buildWorkspacePath(userId, projectId, orphanId);
    await mkdir(path.join(orphanRoot, "evidence"), { recursive: true });
    await writeFile(path.join(orphanRoot, "evidence", "build-summary.json"), JSON.stringify({ projectId, conversationId }), "utf8");
    await writeFile(path.join(orphanRoot, "index.html"), "<h1>Orphan</h1>", "utf8");

    const result = await executeWorkspaceDeletion({
      userId,
      projectId,
      conversationId,
      run: null,
      saveSelection: async () => undefined,
    });

    await expect(readFile(path.join(orphanRoot, "index.html"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(result.deletedWorkspaces).toContain(orphanId);
    await expect(readdir(projectRoot)).resolves.toEqual([]);
  });
});
