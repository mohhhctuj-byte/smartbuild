export type TruthOutcome = "PASS" | "BLOCKED" | "FAILED";
export type TruthCheck = { id: string; label: string; status: TruthOutcome; detail: string; evidencePaths: string[] };

export type TruthEngineRun = {
  id: string;
  projectId: number;
  conversationId: number;
  status: string;
  contract: { acceptanceCriteria: Array<{ id: string }> };
  test?: { passed?: boolean; results: Array<{ criterionId: string; status: string; evidence?: string }> };
  syntheticEvaluation?: {
    final_status: "PASS" | "FAILED" | "BLOCKED";
    checkpoint_allowed: boolean;
    runs: Array<{
      evaluator_instance?: "functional_synthetic_user" | "visual_synthetic_user";
      status: string;
      actions?: Array<{ passed?: boolean }>;
      evidence_paths?: string[];
    }>;
    bugs?: Array<{
      status?: string;
      severity?: string;
      evidence_paths?: string[];
    }>;
  };
  checkpoint?: { type: "checkpointed_git" | "checkpointed_snapshot"; revision: string };
  evidence: Array<{ path: string }>;
};

export type TruthEngineReport = {
  status: TruthOutcome;
  projectId: number | null;
  conversationId: number | null;
  buildRunId: string | null;
  checks: TruthCheck[];
};

function failedOrBlocked(run: TruthEngineRun, detail: string): TruthOutcome {
  return run.status === "blocked" || !["succeeded", "failed", "timed_out", "cancelled"].includes(run.status) ? "BLOCKED" : "FAILED";
}

function evidenceFor(run: TruthEngineRun, prefix: string) {
  return run.evidence.filter(item => item.path.startsWith(prefix)).map(item => item.path);
}

function includesEvidencePath(run: TruthEngineRun, path: string | undefined) {
  return Boolean(path && path.startsWith("evidence/") && run.evidence.some(item => item.path === path));
}

function evaluatorJourneyPass(run: TruthEngineRun, evaluation: NonNullable<TruthEngineRun["syntheticEvaluation"]>, evaluator: "functional_synthetic_user" | "visual_synthetic_user") {
  return evaluation.runs.some(item =>
    item.evaluator_instance === evaluator
    && item.status === "PASS"
    && (item.actions || []).length > 0
    && (item.actions || []).every(action => action.passed === true)
    && (item.evidence_paths || []).some(path => includesEvidencePath(run, path)),
  );
}

function bugClassificationPass(run: TruthEngineRun, evaluation: NonNullable<TruthEngineRun["syntheticEvaluation"]>) {
  const resolvedStatuses = new Set(["FIXED", "WONT_FIX", "DUPLICATE", "UNCONFIRMED"]);
  return Array.isArray(evaluation.bugs) && evaluation.bugs.every(bug =>
    resolvedStatuses.has(bug.status || "")
    && (bug.status === "UNCONFIRMED" || (bug.evidence_paths || []).some(path => includesEvidencePath(run, path))),
  );
}

export function evaluateTruthEngine(input: {
  run: TruthEngineRun | null;
  sourceArtifactCount: number;
  previewReady: boolean;
  exportReady: boolean;
}): TruthEngineReport {
  const { run } = input;
  if (!run) {
    return {
      status: "BLOCKED", projectId: null, conversationId: null, buildRunId: null,
      checks: [{ id: "selection", label: "Scoped Build Run", status: "BLOCKED", detail: "No durable Build Run is selected for this production workspace.", evidencePaths: [] }],
    };
  }

  const criteria = run.contract.acceptanceCriteria;
  const results = run.test?.results || [];
  const allCriteriaPass = criteria.length > 0 && criteria.every(criterion => results.some(result => result.criterionId === criterion.id && result.status === "PASS" && includesEvidencePath(run, result.evidence)));
  const evaluation = run.syntheticEvaluation;
  const evaluatorPass = Boolean(
    evaluation
    && evaluation.final_status === "PASS"
    && evaluation.checkpoint_allowed
    && evaluatorJourneyPass(run, evaluation, "functional_synthetic_user")
    && evaluatorJourneyPass(run, evaluation, "visual_synthetic_user"),
  );
  const bugsPass = Boolean(evaluation && bugClassificationPass(run, evaluation));
  const checkpointPass = run.status === "succeeded" && Boolean(run.checkpoint?.revision) && evidenceFor(run, "evidence/checkpoint").length > 0;
  const previewPass = input.previewReady && evidenceFor(run, "evidence/preview").length > 0;
  const exportPass = input.exportReady && evidenceFor(run, "evidence/snapshot").length > 0;
  const terminalStatus: TruthOutcome = run.status === "succeeded" ? "PASS" : run.status === "blocked" ? "BLOCKED" : ["failed", "timed_out", "cancelled"].includes(run.status) ? "FAILED" : "BLOCKED";
  const checks: TruthCheck[] = [
    { id: "scope", label: "Scoped identity", status: "PASS", detail: `Evidence is anchored to project ${run.projectId}, conversation ${run.conversationId}, and Build Run ${run.id}.`, evidencePaths: [] },
    { id: "build-status", label: "Build state", status: terminalStatus, detail: run.status === "succeeded" ? "The durable Build Run completed successfully." : run.status === "blocked" ? "The durable Build Run is explicitly blocked; success is not inferred." : `The durable Build Run ended as ${run.status}.`, evidencePaths: [] },
    { id: "artifacts", label: "Request-scoped source artifacts", status: input.sourceArtifactCount > 0 ? "PASS" : failedOrBlocked(run, ""), detail: input.sourceArtifactCount > 0 ? `${input.sourceArtifactCount} durable source artifact(s) are available for this Build Run.` : "No durable source artifacts are available for this Build Run; retained evidence files alone cannot establish a release.", evidencePaths: [] },
    { id: "preview", label: "Preview availability", status: previewPass ? "PASS" : failedOrBlocked(run, ""), detail: previewPass ? "The persisted preview responded successfully with a retained scoped evidence file." : "The persisted preview or its retained scoped evidence was unavailable during this evaluation.", evidencePaths: evidenceFor(run, "evidence/preview") },
    { id: "criteria", label: "Required acceptance criteria", status: allCriteriaPass ? "PASS" : failedOrBlocked(run, ""), detail: allCriteriaPass ? "Every required acceptance criterion has a recorded PASS result with retained scoped evidence." : "One or more required acceptance criteria lack a retained scoped PASS result.", evidencePaths: evidenceFor(run, "evidence/test") },
    { id: "evaluators", label: "Functional and visual evaluator journeys", status: evaluatorPass ? "PASS" : failedOrBlocked(run, ""), detail: evaluatorPass ? "Functional and visual evaluators each recorded a named PASS journey with successful actions and retained scoped evidence." : "A named evaluator journey, successful action, or retained scoped evidence is missing; no success is inferred.", evidencePaths: evaluation?.runs.flatMap(item => item.evidence_paths || []).filter(path => includesEvidencePath(run, path)) || evidenceFor(run, "evidence/evaluators") },
    { id: "bugs", label: "Bug classification", status: bugsPass ? "PASS" : failedOrBlocked(run, ""), detail: bugsPass ? "All recorded bugs are classified as resolved, accepted with retained evidence, duplicate, or unconfirmed." : "A bug is unclassified, unresolved, or lacks required retained evidence; no release success is inferred.", evidencePaths: evaluation?.bugs?.flatMap(bug => bug.evidence_paths || []).filter(path => includesEvidencePath(run, path)) || [] },
    { id: "checkpoint", label: "Verified checkpoint", status: checkpointPass ? "PASS" : failedOrBlocked(run, ""), detail: checkpointPass ? `${run.checkpoint?.type === "checkpointed_git" ? "Git" : "Snapshot"} checkpoint is recorded for this succeeded Build Run.` : run.status === "blocked" ? "No verified checkpoint is accepted while this Build Run remains blocked." : "No verified checkpoint is recorded for this succeeded Build Run.", evidencePaths: evidenceFor(run, "evidence/checkpoint") },
    { id: "export", label: "Complete Build Run export", status: exportPass ? "PASS" : failedOrBlocked(run, ""), detail: exportPass ? "The selected Build Run produced a valid ZIP export with a retained scoped manifest." : "The selected Build Run did not produce a valid ZIP export or retained scoped manifest during this evaluation.", evidencePaths: evidenceFor(run, "evidence/snapshot") },
  ];
  const status: TruthOutcome = checks.some(check => check.status === "FAILED") ? "FAILED" : checks.some(check => check.status === "BLOCKED") ? "BLOCKED" : "PASS";
  return { status, projectId: run.projectId, conversationId: run.conversationId, buildRunId: run.id, checks };
}
