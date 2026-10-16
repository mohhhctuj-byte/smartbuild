import { describe, expect, it } from "vitest";
import { createWorkspaceDiagnostic, selectionForDiagnosticRun } from "./workspaceDiagnostics";

describe("createWorkspaceDiagnostic", () => {
  it("reports the selected run health without server paths or implementation errors", () => {
    const diagnostic = createWorkspaceDiagnostic({
      selection: { projectId: 10, conversationId: 20, buildRunId: "run-1" },
      run: {
        id: "run-1",
        projectId: 10,
        conversationId: 20,
        status: "succeeded",
        syntheticEvaluation: {
          checkpoint_allowed: true,
          runs: [{ evaluator_instance: "functional_synthetic_user", status: "PASS" }],
          bugs: [],
        },
        checkpoint: { type: "checkpointed_snapshot", revision: "snapshot-1" },
      },
      artifactCount: 3,
      previewStatus: "ready",
      previewHttpStatus: 200,
      exportStatus: "ready",
      exportHttpStatus: 200,
    });

    expect(diagnostic).toEqual({
      status: "ready",
      projectId: 10,
      conversationId: 20,
      buildRunId: "run-1",
      artifactCount: 3,
      preview: { status: "ready", httpStatus: 200 },
      evaluators: { status: "available", checkpointAllowed: true, runs: [{ evaluator: "functional_synthetic_user", status: "PASS" }] },
      bugs: { count: 0 },
      checkpoint: { status: "available", type: "checkpointed_snapshot" },
      export: { status: "ready", httpStatus: 200, fileName: "smartbuild-cloud-workspace.zip" },
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/workspaceRoot|token|secret|\/home\//i);
  });

  it("makes an unavailable selection explicit instead of inventing run health", () => {
    expect(createWorkspaceDiagnostic({
      selection: null,
      run: null,
      artifactCount: 0,
      previewStatus: "not-requested",
      exportStatus: "not-requested",
    })).toMatchObject({
      status: "unavailable",
      projectId: null,
      conversationId: null,
      buildRunId: null,
      artifactCount: 0,
      evaluators: { status: "unavailable", checkpointAllowed: null, runs: [] },
      bugs: { count: 0 },
      checkpoint: { status: "not-created", type: null },
    });
  });

  it("omits raw durable-task logs and free-form blocker text from the Diagnostic contract", () => {
    const diagnostic = createWorkspaceDiagnostic({
      selection: { projectId: 10, conversationId: 20, buildRunId: "run-raw-proof" },
      run: {
        id: "run-raw-proof",
        projectId: 10,
        conversationId: 20,
        status: "blocked",
        syntheticEvaluation: {
          checkpoint_allowed: false,
          runs: [{ evaluator_instance: "functional_synthetic_user", status: "BLOCKED" }],
          bugs: [],
        },
        checkpoint: undefined,
        logs: ["raw durable task log", "provider secret must not escape"],
        blockedReason: "free-form blocker explanation must not escape",
      } as never,
      artifactCount: 0,
      previewStatus: "unavailable",
      exportStatus: "unavailable",
    });

    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain("raw durable task log");
    expect(serialized).not.toContain("provider secret must not escape");
    expect(serialized).not.toContain("free-form blocker explanation must not escape");
    expect(serialized).not.toContain("blockedReason");
    expect(serialized).not.toContain("logs");
    expect(Object.keys(diagnostic).sort()).toEqual(["artifactCount", "bugs", "buildRunId", "checkpoint", "conversationId", "evaluators", "export", "preview", "projectId", "status"]);
  });

  it("anchors diagnostic identifiers to an explicitly requested owned Build Run", async () => {
    expect(selectionForDiagnosticRun(
      { projectId: 1, conversationId: 2, buildRunId: "old-run" },
      { id: "run-3", projectId: 30, conversationId: 40, status: "succeeded" },
    )).toEqual({ projectId: 30, conversationId: 40, buildRunId: "run-3" });
  });
});
