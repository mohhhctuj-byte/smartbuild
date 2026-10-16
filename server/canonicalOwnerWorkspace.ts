import type { WorkspaceSelectionSnapshot } from "./workspaceProvisioning";

export const CANONICAL_MAYA_SELECTION: WorkspaceSelectionSnapshot = {
  projectId: 6720001,
  conversationId: 6510001,
  buildRunId: "0e5e85c2-859f-40e2-bff5-5632c3c84ca6",
};

const CANONICAL_PROJECT_IDS = new Set([6720001, 6720002]);

/**
 * A claimant's own historical empty workspace must never displace the immutable
 * Maya/Bella release pair after the account has been bound to the canonical
 * workspace user. A canonical project chosen explicitly by the owner remains
 * respected; otherwise restoration starts at Maya's successful release run.
 */
export function canonicalOwnerFallbackSelection(input: {
  sessionWorkspaceUserId: number;
  canonicalWorkspaceUserId: number | undefined;
  stored: WorkspaceSelectionSnapshot | null;
}): WorkspaceSelectionSnapshot | null {
  if (input.sessionWorkspaceUserId !== input.canonicalWorkspaceUserId) return null;
  if (input.stored?.projectId && CANONICAL_PROJECT_IDS.has(input.stored.projectId)) return null;
  return CANONICAL_MAYA_SELECTION;
}
