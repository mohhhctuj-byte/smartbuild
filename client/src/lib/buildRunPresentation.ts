export type PresentedCriterion = { id: string; title: string; capability: string };
export type PresentedCriterionResult = { criterionId: string; status: "PASS" | "FAIL" | "BLOCKED"; evidence: string; reason?: string };
export type PresentedBuildRun = {
  status: string;
  contract: { projectName: string; description: string; acceptanceCriteria: PresentedCriterion[] };
  test?: { passed?: boolean; results: PresentedCriterionResult[] };
  checkpoint?: { type: "checkpointed_git" | "checkpointed_snapshot"; revision: string };
  syntheticEvaluation?: { final_status: "PASS" | "FAILED" | "BLOCKED"; checkpoint_allowed: boolean };
};

const terminalBuildStatuses = new Set(["succeeded", "failed", "blocked", "timed_out", "cancelled"]);

export function hasPassingRequiredEvidence(run: PresentedBuildRun) {
  const criteria = run.contract.acceptanceCriteria;
  const results = run.test?.results || [];
  return Boolean(
    run.status === "succeeded" &&
      run.checkpoint?.revision &&
      run.test?.passed !== false &&
      criteria.length > 0 &&
      criteria.every(criterion => results.some(result => result.criterionId === criterion.id && result.status === "PASS")) &&
      (!run.syntheticEvaluation || (run.syntheticEvaluation.final_status === "PASS" && run.syntheticEvaluation.checkpoint_allowed)),
  );
}

export function workspaceStatusLabel(run: PresentedBuildRun | null) {
  if (!run) return "Cloud workspace";
  if (hasPassingRequiredEvidence(run)) return "Verified build workspace";
  if (run.status === "blocked") return "Blocked build workspace";
  if (["succeeded", "failed", "timed_out", "cancelled"].includes(run.status)) return "Build not verified";
  return "Build in progress";
}

type LogicalProjectRow = { id: number; name: string; updatedAt?: string | number | Date | null };

function projectFreshness(project: LogicalProjectRow) {
  const timestamp = project.updatedAt ? new Date(project.updatedAt).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : project.id;
}

function projectIdentity(project: LogicalProjectRow) {
  const normalized = project.name
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
  if (normalized.includes("maya noor")) return "fixture:maya-noor";
  if (normalized.includes("bella tavola") || normalized === "restaurant landing page") return "fixture:bella-tavola";
  return normalized;
}

export function dedupeProjects<T extends LogicalProjectRow>(projects: T[], preferredProjectId?: number | null) {
  const byLogicalIdentity = new Map<string, T>();
  for (const project of projects) {
    const key = projectIdentity(project);
    const current = byLogicalIdentity.get(key);
    const shouldKeep = !current
      || project.id === preferredProjectId
      || (current.id !== preferredProjectId && projectFreshness(project) > projectFreshness(current));
    if (shouldKeep) byLogicalIdentity.set(key, project);
  }
  return Array.from(byLogicalIdentity.values());
}

export function buildRunTaskGraph(run: PresentedBuildRun) {
  const criterionResults = new Map(run.test?.results.map(result => [result.criterionId, result]) || []);
  const isTerminal = terminalBuildStatuses.has(run.status);
  return {
    goal: run.contract.projectName,
    summary: `${run.contract.description} Each required criterion must pass before SmartBuild can create a verified checkpoint.`,
    tasks: run.contract.acceptanceCriteria.map(criterion => {
      const result = criterionResults.get(criterion.id);
      return {
        id: criterion.id,
        title: criterion.title,
        specialist: `${criterion.capability} capability`,
        status: result?.status === "PASS" ? "Verified" as const : result || isTerminal ? "Blocked" as const : "Pending" as const,
        evidence: result ? `${result.status}: ${result.reason || result.evidence}` : isTerminal ? "No criterion result was recorded." : "Awaiting the tracked verification phase.",
      };
    }),
  };
}
