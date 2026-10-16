import { describe, expect, it } from "vitest";
import { CLOUD_ROLLBACK_CONFIRMATION, CloudRollbackError, rollbackCloudWorkspace, type GitRunner } from "./cloudRollback";

const revision = "a".repeat(40);

describe("cloud rollback", () => {
  it("restores only a recent listed checkpoint after explicit confirmation", async () => {
    const calls: string[][] = [];
    const run: GitRunner = async args => {
      calls.push(args);
      return args[0] === "log" ? `${revision}\n` : "";
    };
    await expect(rollbackCloudWorkspace(revision.slice(0, 8), CLOUD_ROLLBACK_CONFIRMATION, run)).resolves.toMatchObject({ status: "restored", revision });
    expect(calls).toEqual([["log", "-20", "--format=%H"], ["restore", `--source=${revision}`, "--staged", "--worktree", "--", "."]]);
  });

  it("refuses missing confirmation and never invokes git", async () => {
    const run: GitRunner = async () => { throw new Error("must not run"); };
    await expect(rollbackCloudWorkspace(revision, "restore", run)).rejects.toMatchObject<Partial<CloudRollbackError>>({ code: "CONFIRMATION_REQUIRED" });
  });

  it("refuses revisions that are not in the browser-visible recent history", async () => {
    const run: GitRunner = async args => args[0] === "log" ? `${revision}\n` : "";
    await expect(rollbackCloudWorkspace("b".repeat(40), CLOUD_ROLLBACK_CONFIRMATION, run)).rejects.toMatchObject<Partial<CloudRollbackError>>({ code: "REVISION_UNAVAILABLE" });
  });
});
