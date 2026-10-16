import { describe, expect, it } from "vitest";
import { buildRunTaskGraph, dedupeProjects, hasPassingRequiredEvidence, workspaceStatusLabel } from "./buildRunPresentation";

describe("buildRunTaskGraph", () => {
  const contract = {
    projectName: "Maya Noor Portfolio",
    description: "A project-specific portfolio.",
    acceptanceCriteria: [
      { id: "identity", title: "Generated project identity is visible", capability: "frontend" },
      { id: "preview", title: "Preview responds", capability: "preview" },
    ],
  };

  it("labels a blocked Build Run as blocked and never as verified", () => {
    const run = {
      status: "blocked",
      contract,
      test: { passed: false, results: [{ criterionId: "identity", status: "PASS" as const, evidence: "rendered" }] },
      syntheticEvaluation: { final_status: "BLOCKED" as const, checkpoint_allowed: false },
    };
    expect(workspaceStatusLabel(run)).toBe("Blocked build workspace");
    expect(hasPassingRequiredEvidence(run)).toBe(false);
  });

  it("requires succeeded status, a checkpoint, and every required PASS result", () => {
    const run = {
      status: "succeeded",
      contract,
      test: { passed: true, results: contract.acceptanceCriteria.map(criterion => ({ criterionId: criterion.id, status: "PASS" as const, evidence: "evidence" })) },
      checkpoint: { type: "checkpointed_git" as const, revision: "abc123" },
      syntheticEvaluation: { final_status: "PASS" as const, checkpoint_allowed: true },
    };
    expect(hasPassingRequiredEvidence(run)).toBe(true);
    expect(workspaceStatusLabel(run)).toBe("Verified build workspace");
    expect(workspaceStatusLabel({ ...run, checkpoint: undefined })).toBe("Build not verified");
  });

  it("deduplicates project rows by stable project identity", () => {
    expect(dedupeProjects([{ id: 6720001, name: "Maya Noor Portfolio" }, { id: 6720001, name: "Maya Noor Portfolio" }, { id: 6720002, name: "Bella Tavola Restaurant" }])).toEqual([
      { id: 6720001, name: "Maya Noor Portfolio" },
      { id: 6720002, name: "Bella Tavola Restaurant" },
    ]);
  });

  it("keeps one current project row for each logical Maya/Bella workspace while retaining the selected project", () => {
    const rows = [
      { id: 6690001, name: "Maya Noor Portfolio", updatedAt: "2026-08-20T14:42:01.000Z" },
      { id: 6720001, name: "  Maya   Noor Portfolio ", updatedAt: "2026-08-20T14:53:33.000Z" },
      { id: 6690002, name: "Bella Tavola", updatedAt: "2026-08-20T14:42:21.000Z" },
      { id: 6720002, name: "Bella Tavola", updatedAt: "2026-08-20T14:54:00.000Z" },
    ];

    expect(dedupeProjects(rows).map(project => project.id)).toEqual([6720001, 6720002]);
    expect(dedupeProjects(rows, 6690001).map(project => project.id)).toEqual([6690001, 6720002]);
  });

  it("shows durable PASS criteria as Verified after a terminal Build Run", () => {
    const graph = buildRunTaskGraph({ status: "succeeded", contract, test: { results: [
      { criterionId: "identity", status: "PASS", evidence: "Maya title rendered" },
      { criterionId: "preview", status: "PASS", evidence: "HTTP 200" },
    ] } });

    expect(graph.tasks.map(task => task.status)).toEqual(["Verified", "Verified"]);
    expect(graph.tasks.map(task => task.evidence)).toEqual(["PASS: Maya title rendered", "PASS: HTTP 200"]);
  });

  it("keeps an in-progress criterion pending instead of presenting it as blocked", () => {
    const graph = buildRunTaskGraph({ status: "writing", contract });
    expect(graph.tasks.map(task => task.status)).toEqual(["Pending", "Pending"]);
  });

  it("preserves individual PASS and BLOCKED results for a terminal Bella-style run", () => {
    const graph = buildRunTaskGraph({
      status: "blocked",
      contract: {
        projectName: "Bella Tavola Restaurant",
        description: "Restaurant landing page with an external reservation dependency.",
        acceptanceCriteria: [
          { id: "restaurant-hero", title: "Restaurant hero", capability: "frontend" },
          { id: "external-reservation-integration", title: "External reservation integration", capability: "integration" },
        ],
      },
      test: {
        results: [
          { criterionId: "restaurant-hero", status: "PASS", evidence: "Hero renders." },
          { criterionId: "external-reservation-integration", status: "BLOCKED", evidence: "Provider is not configured.", reason: "External reservation provider is unavailable." },
        ],
      },
    });

    expect(graph.tasks.map(task => task.status)).toEqual(["Verified", "Blocked"]);
    expect(graph.tasks[0]?.evidence).toContain("PASS");
    expect(graph.tasks[1]?.evidence).toContain("BLOCKED");
  });
});
