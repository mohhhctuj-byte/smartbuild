import type { BuildRun } from "./verifiedBuildPipeline";

export type DurableHeartbeatBuildRunRef = Pick<BuildRun, "id" | "userId">;

export function isTerminalBuildStatus(status: BuildRun["status"]) {
  return ["succeeded", "failed", "blocked", "timed_out", "cancelled"].includes(status);
}

export async function driveBuildRunHeartbeat(input: {
  taskUid: string;
  findRun: (taskUid: string) => Promise<DurableHeartbeatBuildRunRef | undefined>;
  loadRun: (userId: number, buildId: string) => Promise<BuildRun | null>;
  advance: (run: BuildRun) => Promise<BuildRun>;
  finalize: (run: BuildRun) => Promise<void>;
}) {
  const record = await input.findRun(input.taskUid);
  if (!record) return { done: true, transitioned: false, skipped: "orphan" as const };

  const run = await input.loadRun(record.userId, record.id);
  if (!run) return { done: true, transitioned: false, skipped: "missing-build-run" as const };

  if (isTerminalBuildStatus(run.status)) {
    await input.finalize(run);
    return { done: true, transitioned: false, run, status: run.status };
  }

  const progressed = await input.advance(run);
  const done = isTerminalBuildStatus(progressed.status);
  if (done) await input.finalize(progressed);
  return { done, transitioned: done, run: progressed, status: progressed.status };
}
