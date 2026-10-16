export function workspaceBootstrapPolicy(fresh: boolean) {
  return {
    bootstrapPersonalSession: fresh,
    createProject: fresh,
    createConversation: fresh,
  } as const;
}

export const MISSING_PERSISTED_WORKSPACE_MESSAGE =
  "This signed-in account does not have access to a saved production workspace. Existing Build Runs were not changed.";
