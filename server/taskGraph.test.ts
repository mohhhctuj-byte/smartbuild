import { describe, expect, it } from "vitest";
import { buildInitialTaskGraph, transitionTask, validateTaskGraph } from "./taskGraph";
import { bindFolder, canAccessLocalFolder, safeChildPath, unboundFolder } from "./localProject";

describe("local-first task graph", () => {
  it("builds a blocked-until-bound verified workflow", () => {
    const graph = buildInitialTaskGraph("Create a dashboard");
    expect(graph.tasks.map(task => task.status)).toEqual(["Designed", "Designed", "Blocked", "Blocked", "Blocked"]);
    expect(() => transitionTask(graph, "preview", "Verified")).toThrow("VERIFICATION_EVIDENCE_REQUIRED");
  });

  it("validates specialist assignment before a graph is accepted", () => {
    const graph = buildInitialTaskGraph("Create a dashboard");
    expect(validateTaskGraph(graph)).toBe(graph);
    const invalid = { ...graph, tasks: graph.tasks.map(task => task.id === "plan" ? { ...task, specialist: "builder" } : task) };
    expect(() => validateTaskGraph(invalid)).toThrow("SPECIALIST_NOT_ALLOWED");
  });

  it("allows a verified transition only with evidence", () => {
    const graph = buildInitialTaskGraph("Create a dashboard");
    expect(transitionTask(graph, "plan", "Verified", "Plan schema validated.").tasks[0]?.status).toBe("Verified");
  });

  it("keeps local access blocked until an absolute folder is bound", () => {
    const unbound = unboundFolder();
    expect(canAccessLocalFolder(unbound)).toBe(false);
    expect(() => safeChildPath(unbound, "src/App.tsx")).toThrow("LOCAL_FOLDER_UNBOUND");
    const bound = bindFolder("/workspace/project");
    expect(canAccessLocalFolder(bound)).toBe(true);
    expect(safeChildPath(bound, "src/App.tsx")).toBe("/workspace/project/src/App.tsx");
    expect(() => safeChildPath(bound, "../secrets.env")).toThrow("PATH_OUTSIDE_BOUND_FOLDER");
  });
});
