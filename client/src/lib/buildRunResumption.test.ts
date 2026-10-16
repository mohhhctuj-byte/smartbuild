import { describe, expect, it } from "vitest";
import { isBuildRunResumable } from "./buildRunResumption";

describe("isBuildRunResumable", () => {
  it("continues each durable in-progress stage after Cloud restoration", () => {
    expect(["planned", "queued", "planning", "writing", "previewing", "testing", "verifying"].every(status => isBuildRunResumable(status as Parameters<typeof isBuildRunResumable>[0]))).toBe(true);
  });

  it("never advances an already terminal result", () => {
    expect(["succeeded", "failed", "blocked", "timed_out", "cancelled"].some(status => isBuildRunResumable(status as Parameters<typeof isBuildRunResumable>[0]))).toBe(false);
    expect(isBuildRunResumable(null)).toBe(false);
  });
});
