import { describe, expect, it, vi } from "vitest";
import { driveBuildRunHeartbeat } from "./buildRunHeartbeat";
import type { BuildRun } from "./verifiedBuildPipeline";

const run = (status: BuildRun["status"]): BuildRun => ({
  id: "build-heartbeat-test",
  userId: 41,
  status,
} as BuildRun);

describe("Build Run Heartbeat driver", () => {
  it("does not advance an unknown task UID", async () => {
    const advance = vi.fn();
    const finalize = vi.fn();
    const outcome = await driveBuildRunHeartbeat({
      taskUid: "unknown-task",
      findRun: vi.fn().mockResolvedValue(undefined),
      loadRun: vi.fn(),
      advance,
      finalize,
    });

    expect(outcome).toMatchObject({ done: true, transitioned: false, skipped: "orphan" });
    expect(advance).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("cleans an already terminal run without adding another terminal transition", async () => {
    const terminal = run("succeeded");
    const advance = vi.fn();
    const finalize = vi.fn();
    const outcome = await driveBuildRunHeartbeat({
      taskUid: "scheduled-task",
      findRun: vi.fn().mockResolvedValue({ id: terminal.id, userId: terminal.userId }),
      loadRun: vi.fn().mockResolvedValue(terminal),
      advance,
      finalize,
    });

    expect(outcome).toMatchObject({ done: true, transitioned: false, status: "succeeded" });
    expect(advance).not.toHaveBeenCalled();
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(terminal);
  });

  it("advances one persisted phase and finalizes exactly once when that phase becomes terminal", async () => {
    const pending = run("testing");
    const terminal = run("succeeded");
    const advance = vi.fn().mockResolvedValue(terminal);
    const finalize = vi.fn();
    const outcome = await driveBuildRunHeartbeat({
      taskUid: "scheduled-task",
      findRun: vi.fn().mockResolvedValue({ id: pending.id, userId: pending.userId }),
      loadRun: vi.fn().mockResolvedValue(pending),
      advance,
      finalize,
    });

    expect(outcome).toMatchObject({ done: true, transitioned: true, status: "succeeded", run: terminal });
    expect(advance).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledWith(pending);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(terminal);
  });

  it("leaves the job scheduled while later phases remain non-terminal", async () => {
    const pending = run("planned");
    const progressed = run("writing");
    const finalize = vi.fn();
    const outcome = await driveBuildRunHeartbeat({
      taskUid: "scheduled-task",
      findRun: vi.fn().mockResolvedValue({ id: pending.id, userId: pending.userId }),
      loadRun: vi.fn().mockResolvedValue(pending),
      advance: vi.fn().mockResolvedValue(progressed),
      finalize,
    });

    expect(outcome).toMatchObject({ done: false, transitioned: false, status: "writing" });
    expect(finalize).not.toHaveBeenCalled();
  });
});
