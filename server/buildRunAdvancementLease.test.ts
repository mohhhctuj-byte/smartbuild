import { describe, expect, it } from "vitest";
import { authoritativeBuildRunSnapshot, snapshotAfterRejectedLease } from "./buildRunAdvancementLease";

describe("authoritativeBuildRunSnapshot", () => {
  it("uses the durable post-claim snapshot instead of a stale pre-claim phase", () => {
    const stale = { id: "run-1", status: "planned", artifacts: [] as string[] };
    const durable = { id: "run-1", status: "writing", artifacts: ["index.html", "styles.css", "README.md"] };

    expect(authoritativeBuildRunSnapshot(stale, durable)).toEqual(durable);
  });

  it("keeps the supplied snapshot only when the durable run was removed", () => {
    const stale = { id: "run-1", status: "planned" };
    expect(authoritativeBuildRunSnapshot(stale, null)).toBe(stale);
  });

  it("returns a fresh durable snapshot when another worker owns the active lease", async () => {
    const stale = { id: "run-1", status: "planned", artifacts: [] as string[] };
    const durable = { id: "run-1", status: "writing", artifacts: ["index.html", "styles.css", "README.md"] };
    const loadDurable = async () => durable;

    await expect(snapshotAfterRejectedLease(loadDurable, stale)).resolves.toEqual(durable);
  });

  it("falls back only when the Build Run no longer exists durably", async () => {
    const stale = { id: "run-1", status: "planned" };
    await expect(snapshotAfterRejectedLease(async () => null, stale)).resolves.toBe(stale);
  });
});
