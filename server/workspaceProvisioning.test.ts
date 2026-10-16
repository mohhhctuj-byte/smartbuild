import { describe, expect, it } from "vitest";
import { prepareAccountWorkspace, type ProvisioningConversation, type ProvisioningProject, type WorkspaceProvisioningRepository } from "./workspaceProvisioning";

function repositoryFor(records: Map<number, { projects: ProvisioningProject[]; conversations: ProvisioningConversation[]; selection: { projectId: number | null; conversationId: number | null; buildRunId: string | null } | null }>) {
  let nextProjectId = 9000;
  let nextConversationId = 9900;
  const calls: number[] = [];
  const get = (userId: number) => {
    calls.push(userId);
    const record = records.get(userId);
    if (!record) throw new Error(`Unexpected account ${userId}`);
    return record;
  };
  const repository: WorkspaceProvisioningRepository = {
    listProjects: async userId => get(userId).projects,
    createProject: async (userId, name) => {
      const record = get(userId); const project = { id: ++nextProjectId, name }; record.projects.push(project); return project;
    },
    listConversations: async (userId, projectId) => get(userId).conversations.filter(conversation => conversation.projectId === projectId),
    createConversation: async (userId, projectId, title) => {
      const record = get(userId); const conversation = { id: ++nextConversationId, projectId, title }; record.conversations.push(conversation); return conversation;
    },
    saveSelection: async (userId, selection) => { get(userId).selection = selection; },
  };
  return { repository, calls };
}

describe("per-account workspace provisioning", () => {
  it("restores the verified owner selection and durable Build Run without creating or reassigning workspace data", async () => {
    const ownerId = 41;
    const records = new Map([[ownerId, { projects: [{ id: 6720001, name: "Maya Noor Portfolio" }], conversations: [{ id: 6510001, projectId: 6720001, title: "Maya Noor Portfolio" }], selection: null }]]);
    const { repository, calls } = repositoryFor(records);
    const prepared = await prepareAccountWorkspace({ userId: ownerId, repository, restored: { selection: { projectId: 6720001, conversationId: 6510001, buildRunId: "0e5e85c2-859f-40e2-bff5-5632c3c84ca6" }, run: { id: "0e5e85c2-859f-40e2-bff5-5632c3c84ca6", projectId: 6720001, conversationId: 6510001 } } });

    expect(prepared).toMatchObject({ project: { id: 6720001 }, conversation: { id: 6510001 }, selection: { projectId: 6720001, conversationId: 6510001, buildRunId: "0e5e85c2-859f-40e2-bff5-5632c3c84ca6" }, createdProject: false, createdConversation: false });
    expect(calls.every(id => id === ownerId)).toBe(true);
  });

  it("creates one empty private workspace for a new account and preserves the same binding on a reload", async () => {
    const ownerId = 41; const newAccountId = 99;
    const records = new Map([
      [ownerId, { projects: [{ id: 6720001, name: "Maya Noor Portfolio" }], conversations: [{ id: 6510001, projectId: 6720001, title: "Maya Noor Portfolio" }], selection: null }],
      [newAccountId, { projects: [], conversations: [], selection: null }],
    ]);
    const { repository, calls } = repositoryFor(records);
    const first = await prepareAccountWorkspace({ userId: newAccountId, repository, restored: { selection: null, run: null } });
    const second = await prepareAccountWorkspace({ userId: newAccountId, repository, restored: { selection: first.selection, run: null } });

    expect(first.createdProject).toBe(true); expect(first.createdConversation).toBe(true);
    expect(second).toMatchObject({ project: { id: first.project.id }, conversation: { id: first.conversation.id }, createdProject: false, createdConversation: false });
    expect(records.get(newAccountId)?.projects).toHaveLength(1);
    expect(records.get(newAccountId)?.projects[0]?.name).toBe("My workspace");
    expect(records.get(newAccountId)?.projects.some(project => project.id === 6720001)).toBe(false);
    expect(calls.every(id => id === newAccountId)).toBe(true);
  });

  it("does not retain a Build Run selection when it belongs to a different project or conversation", async () => {
    const userId = 99;
    const records = new Map([[userId, { projects: [{ id: 9001, name: "My workspace" }], conversations: [{ id: 9901, projectId: 9001, title: "New build" }], selection: null }]]);
    const { repository } = repositoryFor(records);
    const prepared = await prepareAccountWorkspace({ userId, repository, restored: { selection: { projectId: 9001, conversationId: 9901, buildRunId: "owner-run" }, run: { id: "owner-run", projectId: 6720001, conversationId: 6510001 } } });

    expect(prepared.selection.buildRunId).toBeNull();
    expect(prepared.project.id).toBe(9001);
  });
});
