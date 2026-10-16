import { describe, expect, it } from "vitest";
import { createQaAgentCollaboration, createQaAgentReport, QA_AGENT_ID, qaAgentInstruction } from "./qaAgentGateway";
import type { SyntheticEvaluationSummary } from "./syntheticUserEvaluation";

const evaluation: SyntheticEvaluationSummary = {
  enabled: true,
  execution_policy: "sequential",
  max_concurrency: 1,
  functional_user_first: true,
  visual_user_second: true,
  run_after_implementation: true,
  run_before_verification: true,
  rerun_after_repair: true,
  max_repair_cycles: 3,
  require_evidence_for_bug: true,
  block_checkpoint_on_critical_or_high: true,
  allow_unapproved_external_side_effects: false,
  runs: [
    { evaluator_instance: "functional_synthetic_user", status: "PASS", started_at: "start", completed_at: "end", actions: [{ step: "submit", passed: true }], evidence_paths: ["evidence/evaluators/functional.json"], screenshot_paths: [], console_errors: [], network_failures: [] },
    {
      evaluator_instance: "visual_synthetic_user", status: "PASS", started_at: "start", completed_at: "end",
      actions: ["desktop", "tablet", "mobile"].map(viewport => ({ step: `${viewport}-viewport`, passed: true })),
      evidence_paths: [
        "evidence/evaluators/visual.json",
        "evidence/evaluators/visual-desktop.png",
        "evidence/evaluators/visual-tablet.png",
        "evidence/evaluators/visual-mobile.png",
      ],
      screenshot_paths: [
        "evidence/evaluators/visual-desktop.png",
        "evidence/evaluators/visual-tablet.png",
        "evidence/evaluators/visual-mobile.png",
      ],
      console_errors: [], network_failures: [],
    },
  ],
  bugs: [],
  repair_tasks: [],
  repair_cycles: 0,
  checkpoint_allowed: true,
  final_status: "PASS",
  output_path: "evidence/evaluators/synthetic-evaluation.json",
};

describe("QA Agent gateway", () => {
  it("keeps release validation as an automated evidence gate, not a separate AI agent", () => {
    expect(createQaAgentCollaboration()).toMatchObject({
      agentId: QA_AGENT_ID,
      name: "Automated Quality Gate",
      role: "quality-assurance",
      requiredChecks: [
        "preview-is-live-and-build-run-scoped",
        "functional-synthetic-user-passes-with-action-evidence",
        "visual-synthetic-user-passes-with-all-viewport-evidence",
        "confirmed-release-blockers-are-resolved",
      ],
    });
    expect(qaAgentInstruction()).toContain("not a separate AI agent");
    expect(qaAgentInstruction()).toContain("Do not implement source changes");
    expect(qaAgentInstruction()).toContain("Never convert a skipped");
  });

  it("passes only when both evaluator runs contain passing actions and persisted evidence", () => {
    const report = createQaAgentReport({
      buildRunId: "run-1",
      evaluation,
      reviewedAt: "now",
      previewVerified: true,
      availableEvidencePaths: evaluation.runs.flatMap(run => run.evidence_paths),
    });
    expect(report.status).toBe("PASS");
    expect(report.checks).toHaveLength(4);
    expect(report.checks.every(check => check.status === "PASS")).toBe(true);
    expect(report.checks[1]?.evidencePaths).toEqual(["evidence/evaluators/functional.json"]);
    expect(report.checks[2]?.evidencePaths).toEqual([
      "evidence/evaluators/visual.json",
      "evidence/evaluators/visual-desktop.png",
      "evidence/evaluators/visual-tablet.png",
      "evidence/evaluators/visual-mobile.png",
    ]);
  });

  it("blocks a visually passing run without all three persisted viewport screenshots", () => {
    const visualRun = evaluation.runs[1]!;
    const report = createQaAgentReport({
      buildRunId: "run-viewport-evidence",
      evaluation: {
        ...evaluation,
        runs: [{
          ...visualRun,
          evidence_paths: visualRun.evidence_paths.filter(path => !path.endsWith("visual-mobile.png")),
          screenshot_paths: visualRun.screenshot_paths.filter(path => !path.endsWith("visual-mobile.png")),
        }, evaluation.runs[0]!],
      },
      reviewedAt: "now",
      previewVerified: true,
      availableEvidencePaths: evaluation.runs.flatMap(run => run.evidence_paths),
    });
    expect(report.status).toBe("BLOCKED");
    expect(report.checks[2]?.status).toBe("BLOCKED");
  });

  it("fails evaluator evidence when a passing run still records browser diagnostics", () => {
    const report = createQaAgentReport({
      buildRunId: "run-diagnostics",
      evaluation: {
        ...evaluation,
        runs: evaluation.runs.map(run => run.evaluator_instance === "functional_synthetic_user"
          ? { ...run, console_errors: ["Uncaught TypeError"] }
          : run),
      },
      reviewedAt: "now",
      previewVerified: true,
      availableEvidencePaths: evaluation.runs.flatMap(run => run.evidence_paths),
    });
    expect(report.status).toBe("FAIL");
    expect(report.checks[1]?.status).toBe("FAIL");
  });

  it("uses the latest evaluator run after a repair cycle instead of an earlier failure", () => {
    const previousFunctionalRun = {
      ...evaluation.runs[0]!,
      status: "FAILED" as const,
      actions: [{ step: "submit", passed: false }],
    };
    const report = createQaAgentReport({
      buildRunId: "run-repaired",
      evaluation: {
        ...evaluation,
        runs: [previousFunctionalRun, evaluation.runs[1]!, evaluation.runs[0]!],
      },
      reviewedAt: "now",
      previewVerified: true,
      availableEvidencePaths: evaluation.runs.flatMap(run => run.evidence_paths),
    });
    expect(report.status).toBe("PASS");
    expect(report.checks[1]?.status).toBe("PASS");
  });

  it("blocks missing or skipped test evidence and fails unresolved high findings", () => {
    const missing = createQaAgentReport({
      buildRunId: "run-2",
      evaluation: { ...evaluation, runs: [evaluation.runs[0]!] },
      reviewedAt: "now",
      previewVerified: true,
      availableEvidencePaths: ["evidence/evaluators/functional.json"],
    });
    expect(missing.status).toBe("BLOCKED");

    const unresolved = createQaAgentReport({
      buildRunId: "run-3",
      evaluation: {
        ...evaluation,
        checkpoint_allowed: false,
        bugs: [{
          bug_id: "bug-1", evaluator_instance: "functional_synthetic_user", category: "functional",
          title: "Broken form", severity: "high", confidence: 1, reproducible: true,
          steps_to_reproduce: ["Submit"], expected_result: "Success", actual_result: "Failure",
          evidence_paths: ["evidence/evaluators/functional.json"], console_errors: [], network_failures: [],
          screenshot_paths: [], status: "BLOCKED",
        }],
        final_status: "BLOCKED",
      },
      reviewedAt: "now",
      previewVerified: true,
      availableEvidencePaths: ["evidence/evaluators/functional.json", "evidence/evaluators/visual.json"],
    });
    expect(unresolved.status).toBe("FAIL");
    expect(unresolved.unresolvedCriticalOrHighCount).toBe(1);
  });

  it("rejects test actions without explicit pass results and unsafe evidence paths", () => {
    const report = createQaAgentReport({
      buildRunId: "run-4",
      evaluation: {
        ...evaluation,
        runs: evaluation.runs.map(run => ({ ...run, actions: [{ step: "test" }], evidence_paths: ["evidence/../private"] })),
      },
      reviewedAt: "now",
      previewVerified: true,
    });
    expect(report.status).toBe("BLOCKED");
    expect(report.checks[1]?.evidencePaths).toEqual([]);
  });
});
