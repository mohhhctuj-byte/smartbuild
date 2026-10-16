import { access, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  deleteDurableBuildRunForUser,
  deleteGeneratedFilesForBuildRun,
  deleteLegacyGeneratedFilesForConversation,
} from "./db";
import { buildWorkspacePath, cancelTimedOutBuild, stopBuildPreview, type BuildRun } from "./verifiedBuildPipeline";

const DELETE_ACTION = /\b(?:delete|remove|clear|wipe|reset)\b|(?:امسح|احذف|حذف|شيل|نظف|افرغ|إفرغ|ابدأ من الصفر|ابدأ من جديد)/i;
const DELETE_TARGET = /\b(?:code|codes|files?|output|artifacts?|workspace|project|everything|all|what(?:ever)?\s+i\s+(?:made|did|built))\b|(?:الكود|الاكواد|الأكواد|الملفات|الملف|اللي عملته|الذي عملته|الي عملته|ما عملته|كل ما عملته|كل اللي عملته|كل حاجة|كل شيء|كل الملفات|المشروع|من الصفر)/i;
const NEGATED_DELETE = /\b(?:do\s+not|don't|dont|never|without)\s+(?:delete|remove|clear|wipe|reset)\b|(?:متعملش|لا|ليس|بدون)\s*(?:مسح|حذف|حذفًا|تمسح|تحذف)|(?:مش|ليس)\s+(?:أنت|انت|انتا)\b[\s\S]{0,30}(?:تمسح|تحذف)/i;

export function isWorkspaceDeletionRequest(value: string) {
  const text = value.trim();
  return Boolean(text && DELETE_ACTION.test(text) && DELETE_TARGET.test(text) && !NEGATED_DELETE.test(text));
}

export type WorkspaceDeletionResult = {
  scope: "build-run" | "conversation";
  buildRunId: string | null;
  deletedPaths: string[];
  deletedWorkspaces: string[];
};

type WorkspaceSummary = { projectId?: unknown; conversationId?: unknown };

function validatedBuildRunWorkspacePath(run: BuildRun, userId: number, projectId: number) {
  const expected = path.resolve(buildWorkspacePath(userId, projectId, run.id));
  const stored = path.resolve(run.workspaceRoot);
  const allowedRoots = [
    path.resolve(path.dirname(path.dirname(expected))),
    path.resolve(path.dirname(path.dirname(stored))),
  ];
  const validStoredPath = allowedRoots.some(root => stored === root || stored.startsWith(`${root}${path.sep}`))
    && path.basename(stored) === `build-${run.id}`;
  if (!validStoredPath) throw new Error("BUILD_WORKSPACE_PATH_INVALID");
  return { expected, stored };
}

async function removeAndVerifyWorkspace(workspacePath: string) {
  await rm(workspacePath, { recursive: true, force: true });
  try {
    await access(workspacePath);
    throw new Error("BUILD_WORKSPACE_DELETE_UNVERIFIED");
  } catch (error) {
    if (error instanceof Error && error.message === "BUILD_WORKSPACE_DELETE_UNVERIFIED") throw error;
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
  }
}

async function removeOrphanedBuildWorkspaces(input: { userId: number; projectId: number; conversationId: number }) {
  const projectRoot = path.dirname(buildWorkspacePath(input.userId, input.projectId, "orphan-scan"));
  const deletedWorkspaces: string[] = [];
  const localStateRoot = path.join(process.cwd(), ".smartbuild-local-state", "build-runs", String(input.userId));
  let entries: string[] = [];
  try {
    entries = await readdir(projectRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
  }
  for (const entry of entries) {
    if (!/^build-[a-z0-9-]+$/i.test(entry)) continue;
    const workspacePath = path.join(projectRoot, entry);
    let summary: WorkspaceSummary | null = null;
    try {
      summary = JSON.parse(await readFile(path.join(workspacePath, "evidence", "build-summary.json"), "utf8")) as WorkspaceSummary;
    } catch {
      continue;
    }
    if (summary?.projectId !== input.projectId || summary.conversationId !== input.conversationId) continue;
    await removeAndVerifyWorkspace(workspacePath);
    deletedWorkspaces.push(entry.slice("build-".length));
  }

  try {
    await mkdir(localStateRoot, { recursive: true });
    for (const entry of await readdir(localStateRoot)) {
      if (!entry.endsWith(".json")) continue;
      const statePath = path.join(localStateRoot, entry);
      try {
        const state = JSON.parse(await readFile(statePath, "utf8")) as { projectId?: unknown; conversationId?: unknown; id?: unknown };
        if (state.projectId === input.projectId && state.conversationId === input.conversationId) {
          await rm(statePath, { force: true });
          if (typeof state.id === "string") deletedWorkspaces.push(state.id);
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
  }
  return Array.from(new Set(deletedWorkspaces));
}

export async function executeWorkspaceDeletion(input: {
  userId: number;
  projectId: number;
  conversationId: number;
  run: BuildRun | null;
  saveSelection: (userId: number, selection: { projectId: number; conversationId: number; buildRunId: null }) => Promise<unknown>;
}): Promise<WorkspaceDeletionResult> {
  if (input.run) {
    const run = input.run;
    const workspacePaths = validatedBuildRunWorkspacePath(run, input.userId, input.projectId);
    await cancelTimedOutBuild(run.id, undefined, "Build cancelled before workspace deletion.");
    await stopBuildPreview(run.id);
    const deletedPaths = Array.from(new Set(run.artifacts.map(artifact => artifact.path)));
    const persistedPaths = await deleteGeneratedFilesForBuildRun(input.userId, run.id);
    await deleteDurableBuildRunForUser(input.userId, input.projectId, run.id);
    await removeAndVerifyWorkspace(workspacePaths.stored);
    if (workspacePaths.expected !== workspacePaths.stored) await removeAndVerifyWorkspace(workspacePaths.expected);
    await rm(path.join(process.cwd(), ".smartbuild-local-state", "build-runs", String(input.userId), `${run.id}.json`), { force: true });
    await input.saveSelection(input.userId, { projectId: input.projectId, conversationId: input.conversationId, buildRunId: null });
    return { scope: "build-run", buildRunId: run.id, deletedPaths: Array.from(new Set([...deletedPaths, ...persistedPaths])), deletedWorkspaces: [run.id] };
  }

  const deletedPaths = await deleteLegacyGeneratedFilesForConversation(input.userId, input.projectId, input.conversationId);
  const deletedWorkspaces = await removeOrphanedBuildWorkspaces(input);
  return { scope: "conversation", buildRunId: null, deletedPaths, deletedWorkspaces };
}

export function deletionAssistantSummary(result: WorkspaceDeletionResult) {
  const scope = result.scope === "build-run" ? `Build Run ${result.buildRunId?.slice(0, 8) || "current"}` : "the current conversation";
  const workspaceDetail = result.deletedWorkspaces.length ? ` Removed Build Run workspace(s): ${result.deletedWorkspaces.map(id => id.slice(0, 8)).join(", ")}.` : "";
  if (!result.deletedPaths.length && !result.deletedWorkspaces.length) {
    return `SmartBuild execution agent cleared ${scope}. No generated source files or Build Run workspaces remained in the selected workspace.`;
  }
  const files = result.deletedPaths.length ? ` Removed ${result.deletedPaths.length} generated file${result.deletedPaths.length === 1 ? "" : "s"}: ${result.deletedPaths.join(", ")}.` : "";
  return `SmartBuild execution agent cleared ${scope}.${files}${workspaceDetail} The project itself was not deleted.`;
}
