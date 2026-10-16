export type WorkspaceAuthenticationMode = "oauth" | "personal" | "none";

export type WorkspaceSession = {
  authenticated: boolean;
  authMode: WorkspaceAuthenticationMode;
};

/**
 * The persistent Maya/Bella workspace may only be recovered through the
 * configured owner's OAuth identity. A browser-only personal cookie is kept
 * for explicit new-workspace creation, but is never an authority to read the
 * owner's durable release-gate data.
 */
export function shouldStartOwnerOAuthForRestoration(
  session: WorkspaceSession,
  freshWorkspace: boolean,
) {
  return !freshWorkspace && session.authMode === "personal";
}
