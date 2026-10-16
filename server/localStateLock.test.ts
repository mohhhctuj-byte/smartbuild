import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireLocalStateLock } from "./localStateLock";

const temporaryDirectories: string[] = [];
const releases: Array<() => void> = [];

afterEach(() => {
  for (const release of releases.splice(0)) release();
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function createStatePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "smartbuild-local-state-lock-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "state.json");
}

describe("local fallback state process lock", () => {
  it("rejects a second server process from sharing the same local auth state", () => {
    const statePath = createStatePath();
    const release = acquireLocalStateLock(statePath);
    releases.push(release);

    expect(() => acquireLocalStateLock(statePath)).toThrow("already in use by another server process");
  });

  it("allows the next server to acquire the state after the owner exits", () => {
    const statePath = createStatePath();
    const release = acquireLocalStateLock(statePath);
    release();

    const nextRelease = acquireLocalStateLock(statePath);
    releases.push(nextRelease);
    expect(fs.existsSync(`${statePath}.lock`)).toBe(true);
  });

  it("removes a stale lock whose process no longer exists", () => {
    const statePath = createStatePath();
    fs.writeFileSync(`${statePath}.lock`, JSON.stringify({ pid: 2_147_483_647, nonce: "stale" }));

    const release = acquireLocalStateLock(statePath);
    releases.push(release);
    expect(fs.existsSync(`${statePath}.lock`)).toBe(true);
  });
});
