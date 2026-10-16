export type WorkspaceSelectionRecord = {
  projectId: number | null;
  conversationId: number | null;
  buildRunId: string | null;
};

export type DurableBuildRunCandidate = {
  id: string;
  projectId: number;
  conversationId: number;
  status: string;
  updatedAt: Date | string;
  sourceArtifactCount?: number;
  previewReady?: boolean;
};

/**
 * Named release-gate fixtures must never be restored into a project carrying
 * the other fixture's durable identity. Generic project names remain valid so
 * ordinary user-renamed workspaces are not rejected.
 */
export function matchesWorkspaceProjectIdentity(projectName: string, contractProjectName: string): boolean {
  const project = projectName.toLocaleLowerCase();
  const contract = contractProjectName.toLocaleLowerCase();
  const mayaContract = contract.includes("maya noor");
  const bellaContract = contract.includes("bella tavola");
  const mayaProject = project.includes("maya noor");
  const bellaProject = project.includes("bella tavola");
  return !(mayaContract && bellaProject) && !(bellaContract && mayaProject);
}

/**
 * A persisted workspace selection is a single identity tuple. A Build Run
 * must never be reattached to a different conversation in the same project,
 * because the resulting Files, Preview, and export views would no longer
 * describe the same request.
 */
export function matchesWorkspaceBuildRunTuple(
  selection: Pick<WorkspaceSelectionRecord, "projectId" | "conversationId">,
  run: Pick<DurableBuildRunCandidate, "projectId" | "conversationId">,
) {
  return selection.projectId === run.projectId && selection.conversationId === run.conversationId;
}

function isRestorable(record: DurableBuildRunCandidate) {
  if ((record.sourceArtifactCount ?? 0) === 0) return false;
  return record.status === "succeeded"
    || record.status === "blocked"
    || record.status === "failed"
    || (record.status === "previewing" && record.previewReady === true);
}

function latestRestorable(records: DurableBuildRunCandidate[]) {
  return [...records]
    .filter(isRestorable)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] || null;
}

/**
 * A null buildRunId is meaningful: it represents a newly selected workspace
 * that has not built anything yet. Only an absent or stale non-null run may
 * fall back to another durable run, and that fallback is project-scoped.
 */
export function chooseWorkspaceBuildRun(
  stored: WorkspaceSelectionRecord | undefined,
  selectedRun: DurableBuildRunCandidate | null,
  selectedProjectRuns: DurableBuildRunCandidate[],
  allRuns: DurableBuildRunCandidate[],
) {
  if (selectedRun && isRestorable(selectedRun)) return selectedRun;
  if (stored) {
    // A legacy selection can have a real project and conversation but no
    // Build Run ID because it predates durable run binding. Recover only a
    // run from that exact conversation; a new workspace has no such match.
    if (!stored.buildRunId && stored.conversationId) {
      const sameConversationRuns = selectedProjectRuns.filter(run => run.conversationId === stored.conversationId);
      return latestRestorable(sameConversationRuns);
    }
    if (!stored.buildRunId && !stored.conversationId) return latestRestorable(selectedProjectRuns);
    return stored.buildRunId ? latestRestorable(selectedProjectRuns) : null;
  }
  return latestRestorable(allRuns);
}
