export type WorkspaceDiagnosticRun = {
  id: string;
  projectId: number;
  conversationId: number;
  status: string;
  syntheticEvaluation?: {
    checkpoint_allowed: boolean;
    runs: Array<{ evaluator_instance: string; status: string }>;
    bugs?: Array<unknown>;
  };
  checkpoint?: { type: "checkpointed_git" | "checkpointed_snapshot"; revision: string };
};

export type WorkspaceDiagnosticSelection = {
  projectId: number | null;
  conversationId: number | null;
  buildRunId: string | null;
} | null;

export function selectionForDiagnosticRun(
  selection: WorkspaceDiagnosticSelection,
  run: WorkspaceDiagnosticRun | null,
): WorkspaceDiagnosticSelection {
  if (!run) return selection;
  return { projectId: run.projectId, conversationId: run.conversationId, buildRunId: run.id };
}

export function createWorkspaceDiagnostic(input: {
  selection: WorkspaceDiagnosticSelection;
  run: WorkspaceDiagnosticRun | null;
  artifactCount: number;
  previewStatus: "ready" | "unavailable" | "not-requested";
  previewHttpStatus?: number | null;
  exportStatus: "ready" | "unavailable" | "not-requested";
  exportHttpStatus?: number | null;
}) {
  const evaluation = input.run?.syntheticEvaluation;
  const bugCount = evaluation?.bugs?.length ?? 0;
  return {
    status: input.run ? "ready" : "unavailable",
    projectId: input.selection?.projectId ?? null,
    conversationId: input.selection?.conversationId ?? null,
    buildRunId: input.selection?.buildRunId ?? null,
    artifactCount: input.artifactCount,
    preview: { status: input.previewStatus, httpStatus: input.previewHttpStatus ?? null },
    evaluators: evaluation
      ? {
          status: "available" as const,
          checkpointAllowed: evaluation.checkpoint_allowed,
          runs: evaluation.runs.map(run => ({ evaluator: run.evaluator_instance, status: run.status })),
        }
      : { status: "unavailable" as const, checkpointAllowed: null, runs: [] },
    bugs: { count: bugCount },
    checkpoint: input.run?.checkpoint ? { status: "available" as const, type: input.run.checkpoint.type } : { status: "not-created" as const, type: null },
    export: { status: input.exportStatus, httpStatus: input.exportHttpStatus ?? null, fileName: "smartbuild-cloud-workspace.zip" },
  };
}
