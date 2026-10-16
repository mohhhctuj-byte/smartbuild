import { describe, expect, it, vi } from "vitest";

const set = vi.fn();
const where = vi.fn().mockResolvedValue(undefined);
const update = vi.fn(() => ({ set }));
const selectLimit = vi.fn().mockResolvedValue([{ id: "run-1", userId: 9, heartbeatTaskUid: "heartbeat-1" }]);
const selectWhere = vi.fn(() => ({ limit: selectLimit }));
const selectFrom = vi.fn(() => ({ where: selectWhere }));
const select = vi.fn(() => ({ from: selectFrom }));

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => ({ update, select })) }));

import { affectedRowsFromDatabaseResult, claimDurableBuildRunAdvancement, releaseDurableBuildRunAdvancement, updateDurableBuildRunHeartbeatTask, updateDurableBuildRunWithAdvancementLease } from "./db";

describe("durable Build Run Heartbeat task updates", () => {
  it("normalizes direct, tuple-shaped, and wrapped database update results", () => {
    expect(affectedRowsFromDatabaseResult({ affectedRows: 1 })).toBe(1);
    expect(affectedRowsFromDatabaseResult([{ affectedRows: 1 }, []])).toBe(1);
    expect(affectedRowsFromDatabaseResult({ result: { rowsAffected: 1 } })).toBe(1);
    expect(affectedRowsFromDatabaseResult({ affected_rows: 0 })).toBe(0);
    expect(affectedRowsFromDatabaseResult(null)).toBe(0);
  });
  it("updates only the scheduler reference instead of overwriting a newer serialized Build Run", async () => {
    process.env.DATABASE_URL = "mysql://smartbuild-test";
    set.mockReturnValue({ where });

    await updateDurableBuildRunHeartbeatTask(9, "run-1", "heartbeat-1");

    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ heartbeatTaskUid: "heartbeat-1", updatedAt: expect.any(Date) });
    expect(where).toHaveBeenCalledTimes(1);
    expect(selectLimit).toHaveBeenCalledWith(1);
  });

  it("claims and releases a Build Run advancement lease without serializing a stale run payload", async () => {
    process.env.DATABASE_URL = "mysql://smartbuild-test";
    set.mockReturnValue({ where });
    selectLimit.mockResolvedValueOnce([{ id: "run-1", userId: 9, advanceLeaseToken: "lease-1" }]);

    await expect(claimDurableBuildRunAdvancement(9, "run-1", "lease-1", 60_000)).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith({
      advanceLeaseToken: "lease-1",
      advanceLeaseExpiresAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });

    await releaseDurableBuildRunAdvancement(9, "run-1", "lease-1");
    expect(set).toHaveBeenLastCalledWith({
      advanceLeaseToken: null,
      advanceLeaseExpiresAt: null,
      updatedAt: expect.any(Date),
    });
  });

  it("fences a Build Run payload save with the owning advancement lease token", async () => {
    process.env.DATABASE_URL = "mysql://smartbuild-test";
    where.mockClear();
    set.mockReturnValue({ where });
    // mysql2's production execution shape is a ResultSetHeader/fields tuple.
    where.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    await expect(updateDurableBuildRunWithAdvancementLease({
      id: "run-1",
      userId: 9,
      projectId: 4,
      conversationId: 8,
      status: "writing",
      workspaceRoot: "cloud/run-1",
      payload: '{"status":"writing","artifacts":["index.html"]}',
      startedAt: new Date("2026-08-19T00:00:00.000Z"),
    }, "lease-current")).resolves.toBe(true);

    expect(set).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "writing",
      payload: '{"status":"writing","artifacts":["index.html"]}',
      updatedAt: expect.any(Date),
    }));
    expect(where).toHaveBeenCalledTimes(1);
  });

  it("still reports a lost lease when the tuple-shaped MySQL result updated no rows", async () => {
    process.env.DATABASE_URL = "mysql://smartbuild-test";
    where.mockClear();
    set.mockReturnValue({ where });
    where.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

    await expect(updateDurableBuildRunWithAdvancementLease({
      id: "run-1",
      userId: 9,
      projectId: 4,
      conversationId: 8,
      status: "writing",
      workspaceRoot: "cloud/run-1",
      payload: '{"status":"writing"}',
      startedAt: new Date("2026-08-19T00:00:00.000Z"),
    }, "lease-stale")).resolves.toBe(false);
  });
});
