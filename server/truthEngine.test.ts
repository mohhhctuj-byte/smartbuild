import { describe, expect, it } from "vitest";
import { evaluateTruthEngine } from "./truthEngine";

const succeededRun = {
  id: "run-maya", projectId: 6720001, conversationId: 6510001, status: "succeeded",
  contract: { acceptanceCriteria: [{ id: "criterion-a" }] },
  test: { passed: true, results: [{ criterionId: "criterion-a", status: "PASS", evidence: "evidence/test-output.json" }] },
  syntheticEvaluation: {
    final_status: "PASS" as const,
    checkpoint_allowed: true,
    runs: [
      { evaluator_instance: "functional_synthetic_user" as const, status: "PASS", actions: [{ passed: true }], evidence_paths: ["evidence/evaluators/functional.json"] },
      { evaluator_instance: "visual_synthetic_user" as const, status: "PASS", actions: [{ passed: true }], evidence_paths: ["evidence/evaluators/visual.json"] },
    ],
    bugs: [],
  },
  checkpoint: { type: "checkpointed_git" as const, revision: "a".repeat(40) },
  evidence: [{ path: "evidence/preview-check.json" }, { path: "evidence/test-output.json" }, { path: "evidence/evaluators/functional.json" }, { path: "evidence/evaluators/visual.json" }, { path: "evidence/evaluators/synthetic-evaluation.json" }, { path: "evidence/checkpoint.json" }, { path: "evidence/snapshot-manifest.json" }],
};

describe("evaluateTruthEngine", () => {
  it("returns PASS only when the selected succeeded run has direct artifacts, preview, export, criterion, evaluator, and checkpoint evidence", () => {
    const report = evaluateTruthEngine({ run: succeededRun, sourceArtifactCount: 2, previewReady: true, exportReady: true });
    expect(report).toMatchObject({ status: "PASS", projectId: 6720001, conversationId: 6510001, buildRunId: "run-maya" });
    expect(report.checks.every(check => check.status === "PASS")).toBe(true);
  });

  it("returns BLOCKED rather than PASS or FAILED for a durable blocked run without a checkpoint", () => {
    const report = evaluateTruthEngine({ run: { ...succeededRun, id: "run-bella", projectId: 6720002, conversationId: 6510002, status: "blocked", checkpoint: undefined }, sourceArtifactCount: 2, previewReady: true, exportReady: true });
    expect(report.status).toBe("BLOCKED");
    expect(report.checks.find(check => check.id === "build-status")?.status).toBe("BLOCKED");
    expect(report.checks.find(check => check.id === "checkpoint")?.status).toBe("BLOCKED");
  });

  it("does not derive success from a foreign or absent selected Build Run", () => {
    const report = evaluateTruthEngine({ run: null, sourceArtifactCount: 0, previewReady: false, exportReady: false });
    expect(report).toMatchObject({ status: "BLOCKED", projectId: null, conversationId: null, buildRunId: null });
  });

  it("returns FAILED for a succeeded run when a claimed preview has no retained scoped evidence", () => {
    const report = evaluateTruthEngine({
      run: { ...succeededRun, evidence: succeededRun.evidence.filter(item => item.path !== "evidence/preview-check.json") },
      sourceArtifactCount: 2,
      previewReady: true,
      exportReady: true,
    });
    expect(report.status).toBe("FAILED");
    expect(report.checks.find(check => check.id === "preview")).toMatchObject({ status: "FAILED", evidencePaths: [] });
  });

  it("returns FAILED when evidence is retained but no durable source artifact exists", () => {
    const report = evaluateTruthEngine({ run: succeededRun, sourceArtifactCount: 0, previewReady: true, exportReady: true });
    expect(report.status).toBe("FAILED");
    expect(report.checks.find(check => check.id === "artifacts")).toMatchObject({ status: "FAILED", evidencePaths: [] });
  });

  it("does not accept duplicate or actionless evaluator rows as functional and visual evidence", () => {
    const report = evaluateTruthEngine({
      run: {
        ...succeededRun,
        syntheticEvaluation: {
          ...succeededRun.syntheticEvaluation,
          runs: [
            { evaluator_instance: "functional_synthetic_user", status: "PASS", actions: [{ passed: true }], evidence_paths: ["evidence/evaluators/functional.json"] },
            { evaluator_instance: "functional_synthetic_user", status: "PASS", actions: [], evidence_paths: ["evidence/evaluators/visual.json"] },
          ],
        },
      },
      sourceArtifactCount: 2,
      previewReady: true,
      exportReady: true,
    });
    expect(report.status).toBe("FAILED");
    expect(report.checks.find(check => check.id === "evaluators")?.status).toBe("FAILED");
  });

  it("does not accept an unresolved classified bug as a release pass", () => {
    const report = evaluateTruthEngine({
      run: {
        ...succeededRun,
        syntheticEvaluation: {
          ...succeededRun.syntheticEvaluation,
          bugs: [{ status: "REPAIR_PLANNED", severity: "medium", evidence_paths: ["evidence/evaluators/functional.json"] }],
        },
      },
      sourceArtifactCount: 2,
      previewReady: true,
      exportReady: true,
    });
    expect(report.status).toBe("FAILED");
    expect(report.checks.find(check => check.id === "bugs")?.status).toBe("FAILED");
  });
});
