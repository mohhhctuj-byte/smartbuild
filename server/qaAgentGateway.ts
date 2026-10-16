import type { SyntheticEvaluationSummary } from "./syntheticUserEvaluation";

export const QA_AGENT_ID = "smartbuild-automated-quality-gate";
export const QA_AGENT_NAME = "Automated Quality Gate";

export const QA_AGENT_QUALITY_GATES = [
  "preview-is-live-and-build-run-scoped",
  "functional-synthetic-user-passes-with-action-evidence",
  "visual-synthetic-user-passes-with-all-viewport-evidence",
  "confirmed-release-blockers-are-resolved",
] as const;

export type QaAgentCheck = {
  id: (typeof QA_AGENT_QUALITY_GATES)[number];
  status: "PASS" | "FAIL" | "BLOCKED";
  evidencePaths: string[];
  detail: string;
};

export type QaAgentReport = {
  agentId: typeof QA_AGENT_ID;
  agentName: typeof QA_AGENT_NAME;
  buildRunId: string;
  reviewedAt: string;
  status: "PASS" | "FAIL" | "BLOCKED";
  checks: QaAgentCheck[];
  bugCount: number;
  unresolvedCriticalOrHighCount: number;
  evidencePath: "evidence/qa-agent-report.json";
};

export type QaAgentCollaboration = {
  agentId: typeof QA_AGENT_ID;
  name: typeof QA_AGENT_NAME;
  role: "quality-assurance";
  collaboratesWith: "smartbuild-builder-agent";
  requiredChecks: typeof QA_AGENT_QUALITY_GATES;
};

const validEvidencePath = (value: string) =>
  value.startsWith("evidence/") && !value.includes("..") && !value.includes("\\");

export function createQaAgentCollaboration(): QaAgentCollaboration {
  return {
    agentId: QA_AGENT_ID,
    name: QA_AGENT_NAME,
    role: "quality-assurance",
    collaboratesWith: "smartbuild-builder-agent",
    requiredChecks: QA_AGENT_QUALITY_GATES,
  };
}

export function qaAgentInstruction() {
  return [
    "Project implementation and release workflows are disabled. Do not run checks, create release decisions, or claim verification for new project work.",
    "Preserve historical evaluation evidence as read-only data.",
    "Require persisted desktop, tablet, and mobile screenshots and a passing action for each viewport. Check every action result and browser/network diagnostic. Never convert a skipped, missing, or unevidenced test into a pass.",
    "Return a release decision only from the persisted evaluator evidence. Unresolved critical/high issues or missing evaluator evidence block release; report lower-severity findings without hiding them.",
  ].join(" ");
}

export function qaAgentQualityBrief() {
  return `QA release gates: ${QA_AGENT_QUALITY_GATES.join(", ")}.`;
}

export function createQaAgentReport(input: {
  buildRunId: string;
  evaluation: SyntheticEvaluationSummary;
  reviewedAt: string;
  previewVerified: boolean;
  availableEvidencePaths?: readonly string[];
}): QaAgentReport {
  const availableEvidence = input.availableEvidencePaths ? new Set(input.availableEvidencePaths) : undefined;
  const isAvailableEvidence = (value: string) => validEvidencePath(value) && (!availableEvidence || availableEvidence.has(value));
  const runsHaveEvidence = input.evaluation.runs.every(run =>
    run.evidence_paths.length > 0 && run.evidence_paths.every(isAvailableEvidence),
  );
  const requiredEvaluators = [
    { id: QA_AGENT_QUALITY_GATES[1], evaluator: "functional_synthetic_user", label: "Functional synthetic-user run" },
    { id: QA_AGENT_QUALITY_GATES[2], evaluator: "visual_synthetic_user", label: "Visual responsive-viewport run" },
  ] as const;
  const requiredVisualEvidence = ["desktop", "tablet", "mobile"].map(
    viewport => `evidence/evaluators/visual-${viewport}.png`,
  );
  const latestRunFor = (evaluator: SyntheticEvaluationSummary["runs"][number]["evaluator_instance"]) =>
    [...input.evaluation.runs].reverse().find(item => item.evaluator_instance === evaluator);
  const checks: QaAgentCheck[] = [
    {
      id: QA_AGENT_QUALITY_GATES[0],
      status: input.previewVerified && input.evaluation.runs.length > 0 && input.evaluation.runs.every(run => run.actions.length > 0) && runsHaveEvidence ? "PASS" : "BLOCKED",
      evidencePaths: input.evaluation.runs.flatMap(run => run.evidence_paths).filter(isAvailableEvidence),
      detail: input.previewVerified && input.evaluation.runs.length > 0 && input.evaluation.runs.every(run => run.actions.length > 0) && runsHaveEvidence
        ? "The current Build Run preview is live and evaluator actions and evidence are persisted."
        : "The preview identity, evaluator actions, or persisted evidence could not be confirmed.",
    },
    ...requiredEvaluators.map(({ id, evaluator, label }) => {
      const run = latestRunFor(evaluator);
      const hasEvidence = Boolean(run?.evidence_paths.length && run.evidence_paths.every(isAvailableEvidence));
      const allActionsPassed = Boolean(run?.actions.length && run.actions.every(action => action.passed === true));
      const diagnosticsClear = Boolean(run && run.console_errors.length === 0 && run.network_failures.length === 0);
      const hasCompleteViewportEvidence = evaluator !== "visual_synthetic_user" || Boolean(
        run
          && requiredVisualEvidence.every(evidencePath =>
            run.screenshot_paths.includes(evidencePath)
            && run.evidence_paths.includes(evidencePath)
            && isAvailableEvidence(evidencePath),
          )
          && ["desktop", "tablet", "mobile"].every(viewport =>
            run.actions.some(action => action.step === `${viewport}-viewport` && action.passed === true),
          ),
      );
      const passed = run?.status === "PASS" && hasEvidence && allActionsPassed && diagnosticsClear && hasCompleteViewportEvidence;
      const hasFailure = run?.status === "FAILED" || Boolean(run && !diagnosticsClear);
      return {
        id,
        status: passed ? "PASS" as const : hasFailure ? "FAIL" as const : "BLOCKED" as const,
        evidencePaths: Array.from(new Set([...(run?.evidence_paths || []), ...(run?.screenshot_paths || [])])).filter(isAvailableEvidence),
        detail: passed
          ? `${label} passed with action and persisted evidence${evaluator === "visual_synthetic_user" ? " for desktop, tablet, and mobile" : ""}.`
          : `${label} did not produce a complete passing run with clean diagnostics and required persisted evidence.`,
      };
    }),
    {
      id: QA_AGENT_QUALITY_GATES[3],
      status: input.evaluation.checkpoint_allowed
        && !input.evaluation.bugs.some(bug => ["critical", "high"].includes(bug.severity) && !["FIXED", "DUPLICATE"].includes(bug.status))
        ? "PASS"
        : "FAIL",
      evidencePaths: input.evaluation.bugs.flatMap(bug => bug.evidence_paths).filter(isAvailableEvidence),
      detail: input.evaluation.checkpoint_allowed
        ? "No unresolved confirmed critical or high-severity evaluator findings block release."
        : "The evaluator recorded an unresolved release blocker.",
    },
  ];
  const status = checks.some(check => check.status === "FAIL")
    ? "FAIL"
    : checks.some(check => check.status === "BLOCKED")
      ? "BLOCKED"
      : input.evaluation.final_status === "PASS" ? "PASS" : "FAIL";
  return {
    agentId: QA_AGENT_ID,
    agentName: QA_AGENT_NAME,
    buildRunId: input.buildRunId,
    reviewedAt: input.reviewedAt,
    status,
    checks,
    bugCount: input.evaluation.bugs.length,
    unresolvedCriticalOrHighCount: input.evaluation.bugs.filter(
      bug => ["critical", "high"].includes(bug.severity) && !["FIXED", "DUPLICATE"].includes(bug.status),
    ).length,
    evidencePath: "evidence/qa-agent-report.json",
  };
}
