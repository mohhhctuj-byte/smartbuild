import { describe, expect, it, beforeEach } from "vitest";
import { appendProjectMemory, clearPlans, clearProjectMemory, getPlan, getProjectMemoryContext, listEvents, listProjectMemory, markGenerated, markPreview, markPreviewBlocked, markTested, recordEvent, savePlan, LOCAL_WORKSPACE_SCOPE } from "./taskGraphStore";

describe("task graph evidence gate", () => {
  beforeEach(async () => {
    clearPlans();
    await Promise.all([
      clearProjectMemory(7, 10, 20),
      clearProjectMemory(7, 10, 21),
      clearProjectMemory(8, 10, 22),
    ]);
  });

  it("stores a verified plan scoped to the workspace conversation", () => {
    const plan = savePlan(1, 10, 20, "Build a dashboard");
    expect(plan.tasks.find(task => task.id === "plan")?.status).toBe("Verified");
    expect(getPlan(1, 10, 20)?.goal).toBe("Build a dashboard");
    expect(getPlan(1, 11, 20)).toBeUndefined();
  });

  it("records generation evidence only after a plan exists", () => {
    expect(markGenerated(1, 10, 20, "generated 2 files")).toBeUndefined();
    savePlan(1, 10, 20, "Build a dashboard");
    const graph = markGenerated(1, 10, 20, "generated 2 files");
    expect(graph?.tasks.find(task => task.id === "generate")?.status).toBe("Verified");
    expect(graph?.tasks.find(task => task.id === "generate")?.evidence).toBe("generated 2 files");
    expect(listEvents(1, 10, 20).map(event => event.type)).toEqual(["plan.created", "generation.verified"]);
  });

  it("requires generation, preview, and QA before a checkpoint", () => {
    expect(recordEvent(2, 10, 20, "checkpoint.saved", "premature checkpoint")).toBeUndefined();
    expect(listEvents(2, 10, 20)).toEqual([]);
    savePlan(2, 10, 20, "Build a workspace");
    expect(recordEvent(2, 10, 20, "checkpoint.saved", "checkpoint before generation")).toBeUndefined();
    markGenerated(2, 10, 20, "generated 1 file");
    expect(recordEvent(2, 10, 20, "checkpoint.saved", "checkpoint before preview")).toBeUndefined();
    markPreview(2, 10, 20, "preview available at http://localhost:3000");
    expect(recordEvent(2, 10, 20, "checkpoint.saved", "checkpoint before QA")).toBeUndefined();
    markTested(2, 10, 20, "pnpm check passed");
    expect(recordEvent(2, 10, 20, "checkpoint.saved", "checkpoint after QA")?.type).toBe("checkpoint.saved");
    expect(listEvents(2, 10, 20).map(event => event.type)).toEqual(["plan.created", "generation.verified", "preview.verified", "qa.verified", "checkpoint.saved"]);
  });

  it("records a preview blocker after generation without unlocking QA", () => {
    savePlan(3, 10, 20, "Build a workspace");
    markGenerated(3, 10, 20, "generated 1 file");
    const graph = markPreviewBlocked(3, 10, 20, "Preview blocked: desktop bridge unavailable");
    expect(graph?.tasks.find(task => task.id === "preview")).toMatchObject({ status: "Blocked", evidence: "Preview blocked: desktop bridge unavailable" });
    expect(markTested(3, 10, 20, "pnpm check passed")).toBeUndefined();
    expect(listEvents(3, 10, 20).map(event => event.type)).toEqual(["plan.created", "generation.verified", "preview.blocked"]);
  });

  it("enforces local folder transition order", () => {
    expect(recordEvent(1, 0, 0, "local.unbound", "invalid unbind")).toBeUndefined();
    recordEvent(1, 0, 0, "local.bound", "Bound local folder veyra-project.");
    recordEvent(1, 0, 0, "local.rebound", "Rebound local folder veyra-project-2.");
    recordEvent(1, 0, 0, "local.unbound", "Unbound the user-scoped local folder.");
    expect(listEvents(1, LOCAL_WORKSPACE_SCOPE.projectId, LOCAL_WORKSPACE_SCOPE.conversationId).map(event => event.type)).toEqual(["local.bound", "local.rebound", "local.unbound"]);
    expect(listEvents(2, LOCAL_WORKSPACE_SCOPE.projectId, LOCAL_WORKSPACE_SCOPE.conversationId)).toEqual([]);
  });

  it("stores project-scoped code memory separately from chat history", async () => {
    await clearProjectMemory(7, 10, 20);
    await appendProjectMemory(7, 10, 20, "file_proposal", { path: "src/App.tsx", summary: "single-page layout" });
    await appendProjectMemory(7, 10, 20, "build_summary", { summary: "added layout and palette" });
    await appendProjectMemory(7, 10, 21, "file_proposal", { path: "src/admin.tsx", summary: "admin dashboard" });

    const memory = await listProjectMemory(7, 10, 20);
    const otherMemory = await listProjectMemory(7, 10, 21);
    const context = await getProjectMemoryContext(7, 10, 20);

    expect(memory).toHaveLength(3);
    expect(otherMemory).toHaveLength(3);
    expect(context).toContain("src/App.tsx");
    expect(context).toContain("src/admin.tsx");
  });

  it("rejects secret material before it is persisted in project memory", async () => {
    await clearProjectMemory(8, 10, 22);
    await expect(appendProjectMemory(8, 10, 22, "decision", { api_key: "must-not-persist" })).rejects.toThrow("SECRET_MATERIAL_NOT_ALLOWED_IN_MEMORY");
    await expect(listProjectMemory(8, 10, 22)).resolves.toEqual([]);
  });
});
