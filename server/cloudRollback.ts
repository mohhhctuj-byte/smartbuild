import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rollbackConfirmation = "RESTORE CLOUD CHECKPOINT";
const revisionPattern = /^[a-f0-9]{7,64}$/i;

export class CloudRollbackError extends Error {
  constructor(public readonly code: "CONFIRMATION_REQUIRED" | "INVALID_REVISION" | "REVISION_UNAVAILABLE" | "ROLLBACK_FAILED", message: string) {
    super(message);
  }
}

export type GitRunner = (args: string[]) => Promise<string>;

async function runGit(args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: process.cwd(), timeout: 10_000, maxBuffer: 64 * 1024 });
  return result.stdout.toString();
}

export async function listCloudRollbackRevisions(run: GitRunner = runGit): Promise<string[]> {
  try {
    return (await run(["log", "-20", "--format=%H"]))
      .split("\n")
      .map(value => value.trim())
      .filter(value => /^[a-f0-9]{40}$/i.test(value));
  } catch {
    return [];
  }
}

export async function rollbackCloudWorkspace(revision: string, confirmation: string, run: GitRunner = runGit) {
  if (confirmation !== rollbackConfirmation) {
    throw new CloudRollbackError("CONFIRMATION_REQUIRED", `Type ${rollbackConfirmation} to restore a Cloud checkpoint.`);
  }
  if (!revisionPattern.test(revision)) {
    throw new CloudRollbackError("INVALID_REVISION", "Choose a checkpoint from Cloud workspace history.");
  }
  const available = await listCloudRollbackRevisions(run);
  const resolved = available.find(hash => hash === revision || hash.startsWith(revision));
  if (!resolved) {
    throw new CloudRollbackError("REVISION_UNAVAILABLE", "That checkpoint is not available in the recent Cloud workspace history.");
  }
  try {
    // `git restore` changes tracked files only. It preserves untracked files and intentionally avoids git reset.
    await run(["restore", `--source=${resolved}`, "--staged", "--worktree", "--", "."]);
    return { status: "restored" as const, revision: resolved, preserved: "untracked-files" as const };
  } catch {
    throw new CloudRollbackError("ROLLBACK_FAILED", "Cloud checkpoint restore could not be completed.");
  }
}

export const CLOUD_ROLLBACK_CONFIRMATION = rollbackConfirmation;
