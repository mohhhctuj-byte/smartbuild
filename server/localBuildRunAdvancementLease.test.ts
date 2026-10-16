import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { claimLocalBuildRunAdvancement, releaseLocalBuildRunAdvancement } from "./localBuildRunAdvancementLease";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("local Build Run advancement lease", () => {
  it("allows one process to advance a Build Run and only releases the matching lease token", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "smartbuild-local-run-lease-"));
    roots.push(root);

    await expect(claimLocalBuildRunAdvancement(7, "run-1", "lease-a", root)).resolves.toBe(true);
    await expect(claimLocalBuildRunAdvancement(7, "run-1", "lease-b", root)).resolves.toBe(false);
    await expect(releaseLocalBuildRunAdvancement(7, "run-1", "lease-b", root)).resolves.toBe(false);
    await expect(claimLocalBuildRunAdvancement(7, "run-1", "lease-c", root)).resolves.toBe(false);
    await expect(releaseLocalBuildRunAdvancement(7, "run-1", "lease-a", root)).resolves.toBe(true);
    await expect(claimLocalBuildRunAdvancement(7, "run-1", "lease-c", root)).resolves.toBe(true);
    await expect(releaseLocalBuildRunAdvancement(7, "run-1", "lease-c", root)).resolves.toBe(true);
  });

  it("serializes concurrent claims for the same Build Run", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "smartbuild-local-run-lease-"));
    roots.push(root);
    const claims = await Promise.all(
      Array.from({ length: 8 }, (_value, index) => claimLocalBuildRunAdvancement(7, "run-2", `lease-${index}`, root)),
    );

    expect(claims.filter(Boolean)).toHaveLength(1);
  });
});
