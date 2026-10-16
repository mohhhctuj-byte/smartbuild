import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_DIFF_BYTES = 200_000;
const REVISION = /^[0-9a-f]{7,40}$/i;

export class CloudDiffError extends Error {
  constructor(public readonly code: "INVALID_REVISION" | "REVISION_UNAVAILABLE" | "DIFF_UNAVAILABLE") {
    super(code === "INVALID_REVISION" ? "Choose a checkpoint from the Cloud workspace log." : code === "REVISION_UNAVAILABLE" ? "That Cloud workspace checkpoint is no longer available." : "The Git diff is unavailable for that checkpoint.");
  }
}

export type GitRunner = (args: string[]) => Promise<string>;

async function runGit(args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: process.cwd(), timeout: 10_000, maxBuffer: MAX_DIFF_BYTES + 8_192 });
  return result.stdout.toString();
}

export async function listCloudRevisions(run: GitRunner = runGit) {
  return (await run(["log", "-5", "--pretty=format:%h"])).trim().split("\n").filter(Boolean);
}

export async function readCloudRevisionDiff(revision: string, run: GitRunner = runGit) {
  const requested = revision.trim();
  if (!REVISION.test(requested)) throw new CloudDiffError("INVALID_REVISION");
  const allowed = await listCloudRevisions(run);
  const resolved = allowed.find(value => value.toLowerCase() === requested.toLowerCase());
  if (!resolved) throw new CloudDiffError("REVISION_UNAVAILABLE");
  try {
    const output = await run(["show", "--format=", "--no-ext-diff", "--unified=3", resolved, "--", "."]);
    return { revision: resolved, diff: output.slice(0, MAX_DIFF_BYTES), truncated: output.length > MAX_DIFF_BYTES };
  } catch {
    throw new CloudDiffError("DIFF_UNAVAILABLE");
  }
}
