export type WorkspaceSelectionSnapshot = {
  projectId: number | null;
  conversationId: number | null;
  buildRunId: string | null;
};

export type ProvisioningProject = { id: number; name: string };
export type ProvisioningConversation = { id: number; projectId: number; title: string };
export type ProvisioningRun = { id: string; projectId: number; conversationId: number };

export type RestoredWorkspaceSnapshot = {
  selection: WorkspaceSelectionSnapshot | null;
  run: ProvisioningRun | null;
};

export type WorkspaceProvisioningRepository = {
  listProjects: (userId: number) => Promise<ProvisioningProject[]>;
  createProject: (userId: number, name: string, description: string) => Promise<ProvisioningProject | undefined>;
  listConversations: (userId: number, projectId: number) => Promise<ProvisioningConversation[]>;
  createConversation: (userId: number, projectId: number, title: string) => Promise<ProvisioningConversation | undefined>;
  saveSelection: (userId: number, selection: WorkspaceSelectionSnapshot) => Promise<unknown>;
};

export type PreparedWorkspace = {
  project: ProvisioningProject;
  conversation: ProvisioningConversation;
  selection: WorkspaceSelectionSnapshot;
  createdProject: boolean;
  createdConversation: boolean;
};

/**
 * Prepares only the authenticated user's own workspace. The repository contract
 * intentionally requires the user id on every read and write: callers cannot
 * pass a project, conversation, or Build Run from another account into this
 * operation. A durable owner selection is preferred verbatim; new accounts get
 * one empty project and one empty conversation, never a copied Build Run.
 */
export async function prepareAccountWorkspace(input: {
  userId: number;
  restored: RestoredWorkspaceSnapshot;
  repository: WorkspaceProvisioningRepository;
}): Promise<PreparedWorkspace> {
  const { userId, restored, repository } = input;
  const projects = await repository.listProjects(userId);
  let createdProject = false;
  let project = projects.find(candidate => candidate.id === restored.selection?.projectId) || projects[0];

  if (!project) {
    const created = await repository.createProject(userId, "My workspace", "Private SmartBuild workspace for this account.");
    if (!created) throw new Error("WORKSPACE_PROVISIONING_FAILED");
    project = created;
    createdProject = true;
  }

  const conversations = await repository.listConversations(userId, project.id);
  let createdConversation = false;
  let conversation = conversations.find(candidate => candidate.id === restored.selection?.conversationId) || conversations[0];
  if (!conversation) {
    const created = await repository.createConversation(userId, project.id, "New build");
    if (!created) throw new Error("WORKSPACE_PROVISIONING_FAILED");
    conversation = created;
    createdConversation = true;
  }
  if (conversation.projectId !== project.id) throw new Error("WORKSPACE_PROVISIONING_FAILED");

  const buildRunId = restored.run && restored.run.projectId === project.id && restored.run.conversationId === conversation.id
    ? restored.run.id
    : null;
  const selection: WorkspaceSelectionSnapshot = { projectId: project.id, conversationId: conversation.id, buildRunId };
  await repository.saveSelection(userId, selection);

  return { project, conversation, selection, createdProject, createdConversation };
}
