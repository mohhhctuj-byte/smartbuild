export type LegacyWorkspaceClaimState = "claimable" | "claimed" | "recovery_required" | "unavailable";

export type LegacyWorkspaceClaimCandidate = {
  emailVerified: boolean;
  userId: number | null;
  workspaceUserId?: number | null;
};

/**
 * Reduces the claim decision to non-sensitive booleans and identifiers.  It
 * never receives project, conversation, Build Run, file, or session data.
 */
export function legacyWorkspaceClaimPolicy(input: {
  account?: LegacyWorkspaceClaimCandidate | null;
  canonicalUserId?: number | null;
  claimExists?: boolean;
  verifiedOwnerExists?: boolean;
}): LegacyWorkspaceClaimState {
  if (!input.account?.emailVerified || !input.canonicalUserId) return "unavailable";
  if (input.account.userId === input.canonicalUserId || input.account.workspaceUserId === input.canonicalUserId) return "claimed";
  if (input.claimExists || input.verifiedOwnerExists) return "recovery_required";
  return "claimable";
}
