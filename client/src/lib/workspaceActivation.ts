export type WorkspaceSelection = {
  projectId: number;
  conversationId: number | null;
  buildRunId: string | null;
};

export class WorkspaceRestoreTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Cloud workspace restoration exceeded ${Math.ceil(timeoutMs / 1000)} seconds.`);
    this.name = "WorkspaceRestoreTimeoutError";
  }
}

/**
 * Bounds the initial Cloud-workspace bootstrap without cancelling a newer
 * explicit workspace activation. Callers invalidate their activation revision
 * on timeout, so a late response cannot overwrite a retry or a user choice.
 */
export function withWorkspaceRestoreTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new WorkspaceRestoreTimeoutError(timeoutMs)), timeoutMs);
    operation.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Produces the only valid client state for a user-initiated retry after the
 * visible restoration timeout. Keeping this transition pure lets the UI clear
 * stale diagnostics before starting a new, independently fenced activation.
 */
export function workspaceRestorationRetryState() {
  return { ready: false, restorationError: null } as const;
}

export type ActiveWorkspace = {
  project: { id: number; name: string };
  conversation: { id: number; projectId: number; title: string };
};

/**
 * Stores the newest activated workspace outside a render closure. This is
 * deliberately synchronous: a send handler retained by a child during a
 * React state transition must never post a request using the previous project.
 */
export class ActiveWorkspaceBinding {
  private active: ActiveWorkspace | null = null;

  set(workspace: ActiveWorkspace) {
    this.active = workspace;
  }

  clear() {
    this.active = null;
  }

  get() {
    return this.active;
  }

  matches(selection: Pick<WorkspaceSelection, "projectId" | "conversationId">) {
    return Boolean(
      this.active
      && this.active.project.id === selection.projectId
      && this.active.conversation.id === selection.conversationId,
    );
  }
}

/**
 * Serializes client-side workspace activation intent. A slow bootstrap request
 * must never overwrite a newer explicit New Workspace or project selection.
 */
export class WorkspaceActivationCoordinator {
  private revision = 0;
  private selection: WorkspaceSelection | null = null;

  begin() {
    this.revision += 1;
    return this.revision;
  }

  isCurrent(revision: number) {
    return revision === this.revision;
  }

  choose(selection: WorkspaceSelection) {
    this.selection = selection;
    return this.begin();
  }

  latestSelection() {
    return this.selection;
  }
}

/**
 * Marks user-initiated operations that are valid only for the workspace in
 * which they began. A request that waits for activation must be discarded if
 * the user chooses New Workspace before it can create a Build Run.
 */
export class WorkspaceOperationEpoch {
  private value = 0;

  capture() {
    return this.value;
  }

  invalidate() {
    this.value += 1;
    return this.value;
  }

  isCurrent(epoch: number) {
    return epoch === this.value;
  }
}

/**
 * A response may modify the React workspace only when it still belongs to the
 * current operation, active project/conversation, and durable Build Run
 * selection. This closes the gap between aborting a request and receiving a
 * response that was already in flight when the user opened another workspace.
 */
export function isWorkspaceResponseCurrent({
  operation,
  operationEpoch,
  binding,
  coordinator,
  selection,
}: {
  operation: WorkspaceOperationEpoch;
  operationEpoch: number;
  binding: ActiveWorkspaceBinding;
  coordinator: WorkspaceActivationCoordinator;
  selection: WorkspaceSelection;
}) {
  const latest = coordinator.latestSelection();
  return operation.isCurrent(operationEpoch)
    && binding.matches(selection)
    && (!latest
      || (latest.projectId === selection.projectId
        && latest.conversationId === selection.conversationId
        && latest.buildRunId === selection.buildRunId));
}

export function isRunForWorkspace(
  run: { projectId: number; conversationId: number } | null | undefined,
  workspace: { projectId: number; conversationId: number },
) {
  return Boolean(run && run.projectId === workspace.projectId && run.conversationId === workspace.conversationId);
}

/**
 * React uses this scope as the key for the composer. Changing either identity
 * remounts its local draft state, so an unsent request never crosses a Cloud
 * workspace or conversation boundary.
 */
export function workspaceComposerScope(projectId: number | null, conversationId: number | null) {
  return `${projectId ?? "pending"}:${conversationId ?? "pending"}`;
}

/**
 * A Cloud export is immutable evidence for one Build Run. Never use the
 * generic endpoint from a UI that already knows the selected run: a reused
 * URL can be served from a browser/CDN cache after the user switches projects.
 */
export function buildRunExportUrl(buildRunId: string | null | undefined) {
  return buildRunId
    ? `/api/cloud/export.zip?buildRunId=${encodeURIComponent(buildRunId)}`
    : "/api/cloud/export.zip";
}

/**
 * Serializes durable-selection writes. A request that began before a new
 * workspace or conversation was created may still reach the server, but its
 * response can no longer become the last persisted selection.
 */
export class WorkspaceSelectionWriteQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(write: () => Promise<T>) {
    const scheduled = this.tail.then(write, write);
    this.tail = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }

  waitForIdle() {
    return this.enqueue(async () => undefined);
  }
}
