import { describe, expect, it } from "vitest";
import { isRefreshCurrent } from "./refreshGuard";

describe("isRefreshCurrent", () => {
  it("accepts only the latest generation for the selected Build Run", () => {
    expect(isRefreshCurrent(4, 4, "run-current", "run-current")).toBe(true);
    expect(isRefreshCurrent(3, 4, "run-current", "run-current")).toBe(false);
    expect(isRefreshCurrent(4, 4, "run-old", "run-current")).toBe(false);
    expect(isRefreshCurrent(4, 4, null, "run-current")).toBe(false);
  });
});

