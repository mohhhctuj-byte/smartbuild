import { describe, expect, it, vi } from "vitest";
import { ActiveWorkspaceBinding, buildRunExportUrl, isRunForWorkspace, isWorkspaceResponseCurrent, withWorkspaceRestoreTimeout, workspaceComposerScope, workspaceRestorationRetryState, WorkspaceActivationCoordinator, WorkspaceOperationEpoch, WorkspaceRestoreTimeoutError, WorkspaceSelectionWriteQueue } from "./workspaceActivation";

describe("WorkspaceActivationCoordinator", () => {
  it("invalidates a slow bootstrap when the user explicitly creates a new workspace", () => {
    const coordinator = new WorkspaceActivationCoordinator();
    const bootstrap = coordinator.begin();
    const fresh = coordinator.choose({ projectId: 9, conversationId: 19, buildRunId: null });

    expect(coordinator.isCurrent(bootstrap)).toBe(false);
    expect(coordinator.isCurrent(fresh)).toBe(true);
    expect(coordinator.latestSelection()).toEqual({ projectId: 9, conversationId: 19, buildRunId: null });
  });

  it("preserves the exact Maya and Bella identity tuples across a reload-style rehydration", () => {
    const coordinator = new WorkspaceActivationCoordinator();
    const maya = { projectId: 6720001, conversationId: 6510001, buildRunId: "0e5e85c2-859f-40e2-bff5-5632c3c84ca6" };
    const bella = { projectId: 6720002, conversationId: 6510002, buildRunId: "6074749d-1c80-4507-a216-fcff5491de46" };

    coordinator.choose(maya);
    expect(coordinator.latestSelection()).toEqual(maya);
    coordinator.choose(bella);
    expect(coordinator.latestSelection()).toEqual(bella);
    coordinator.choose(maya);
    expect(coordinator.latestSelection()).toEqual(maya);
  });

  it("retains the newest explicit selection without resurrecting an earlier Build Run", () => {
    const coordinator = new WorkspaceActivationCoordinator();
    const prior = coordinator.choose({ projectId: 2, conversationId: 12, buildRunId: "bella-run" });
    const fresh = coordinator.choose({ projectId: 9, conversationId: 19, buildRunId: null });

    expect(coordinator.isCurrent(prior)).toBe(false);
    expect(coordinator.isCurrent(fresh)).toBe(true);
    expect(coordinator.latestSelection()?.buildRunId).toBeNull();
  });

  it("serializes selection writes so a newer conversation remains the final durable selection", async () => {
    const queue = new WorkspaceSelectionWriteQueue();
    const writes: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const first = queue.enqueue(async () => { writes.push("project-only:start"); await firstGate; writes.push("project-only:end"); });
    const second = queue.enqueue(async () => { writes.push("conversation:3600002"); });

    await Promise.resolve();
    expect(writes).toEqual(["project-only:start"]);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(writes).toEqual(["project-only:start", "project-only:end", "conversation:3600002"]);
  });
});

describe("ActiveWorkspaceBinding", () => {
  it("returns the newest fresh workspace to an earlier retained send handler", () => {
    const binding = new ActiveWorkspaceBinding();
    binding.set({ project: { id: 10, name: "Restaurant Landing Page" }, conversation: { id: 100, projectId: 10, title: "New build" } });
    binding.clear();
    binding.set({ project: { id: 19, name: "Workspace 19" }, conversation: { id: 190, projectId: 19, title: "New build" } });

    expect(binding.get()).toEqual({ project: { id: 19, name: "Workspace 19" }, conversation: { id: 190, projectId: 19, title: "New build" } });
  });

  it("matches only the active project and conversation", () => {
    const binding = new ActiveWorkspaceBinding();
    binding.set({ project: { id: 19, name: "Workspace 19" }, conversation: { id: 190, projectId: 19, title: "New build" } });

    expect(binding.matches({ projectId: 19, conversationId: 190 })).toBe(true);
    expect(binding.matches({ projectId: 18, conversationId: 190 })).toBe(false);
  });
});

describe("WorkspaceOperationEpoch", () => {
  it("invalidates a request that began before the user created a new workspace", () => {
    const epoch = new WorkspaceOperationEpoch();
    const pendingSend = epoch.capture();
    epoch.invalidate();

    expect(epoch.isCurrent(pendingSend)).toBe(false);
  });

  it("rejects delayed Build Run updates after a workspace transition", () => {
    const epoch = new WorkspaceOperationEpoch();
    const delayedPoll = epoch.capture();
    epoch.invalidate();

    expect(epoch.isCurrent(delayedPoll)).toBe(false);
  });

  it("rejects delayed messages and files from a prior workspace after New Workspace", () => {
    const operation = new WorkspaceOperationEpoch();
    const coordinator = new WorkspaceActivationCoordinator();
    const binding = new ActiveWorkspaceBinding();
    binding.set({ project: { id: 8, name: "SaaS launchpad" }, conversation: { id: 80, projectId: 8, title: "SaaS" } });
    const staleSelection = { projectId: 8, conversationId: 80, buildRunId: null };
    coordinator.choose(staleSelection);
    const delayedResponse = operation.capture();

    operation.invalidate();
    coordinator.choose({ projectId: 24, conversationId: 240, buildRunId: null });
    binding.set({ project: { id: 24, name: "Workspace 24" }, conversation: { id: 240, projectId: 24, title: "New build" } });

    expect(isWorkspaceResponseCurrent({ operation, operationEpoch: delayedResponse, binding, coordinator, selection: staleSelection })).toBe(false);
  });

  it("rejects a late Maya result after Bella has become the selected Build Run", () => {
    const operation = new WorkspaceOperationEpoch();
    const coordinator = new WorkspaceActivationCoordinator();
    const binding = new ActiveWorkspaceBinding();
    const maya = { projectId: 101, conversationId: 201, buildRunId: "maya-run" };
    coordinator.choose(maya);
    binding.set({ project: { id: 101, name: "Maya Noor" }, conversation: { id: 201, projectId: 101, title: "Portfolio" } });
    const delayedMaya = operation.capture();

    operation.invalidate();
    coordinator.choose({ projectId: 102, conversationId: 202, buildRunId: "bella-run" });
    binding.set({ project: { id: 102, name: "Bella Tavola" }, conversation: { id: 202, projectId: 102, title: "Restaurant" } });

    expect(isWorkspaceResponseCurrent({ operation, operationEpoch: delayedMaya, binding, coordinator, selection: maya })).toBe(false);
  });
});

describe("withWorkspaceRestoreTimeout", () => {
  it("settles with a truthful timeout instead of leaving restoration pending indefinitely", async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => undefined);
    const restoration = withWorkspaceRestoreTimeout(pending, 1_200);
    const timeoutResult = restoration.then(
      () => null,
      error => error,
    );
    try {
      await vi.advanceTimersByTimeAsync(1_200);
      await expect(timeoutResult).resolves.toBeInstanceOf(WorkspaceRestoreTimeoutError);
    } finally {
      vi.useRealTimers();
    }
  });

  it("prepares a visible timeout diagnostic for a fresh retry without retaining the stale error", () => {
    expect(workspaceRestorationRetryState()).toEqual({ ready: false, restorationError: null });
  });
});

describe("isRunForWorkspace", () => {
  it("accepts only the Build Run belonging to the opened conversation", () => {
    expect(isRunForWorkspace({ projectId: 22, conversationId: 220 }, { projectId: 22, conversationId: 220 })).toBe(true);
    expect(isRunForWorkspace({ projectId: 22, conversationId: 221 }, { projectId: 22, conversationId: 220 })).toBe(false);
  });
});

describe("workspaceComposerScope", () => {
  it("changes whenever a new workspace or conversation is activated", () => {
    const saasScope = workspaceComposerScope(8, 80);
    const mayaScope = workspaceComposerScope(26, 4410001);

    expect(mayaScope).not.toBe(saasScope);
    expect(workspaceComposerScope(26, 4410002)).not.toBe(mayaScope);
  });
});

describe("buildRunExportUrl", () => {
  it("pins a ZIP request to the selected Build Run rather than relying on a reusable generic URL", () => {
    expect(buildRunExportUrl("maya-run/2026")).toBe("/api/cloud/export.zip?buildRunId=maya-run%2F2026");
    expect(buildRunExportUrl(null)).toBe("/api/cloud/export.zip");
  });
});
