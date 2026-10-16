import { describe, expect, it } from "vitest";
import { bindFolder, canAccessLocalFolder, safeChildPath, unboundFolder } from "./localProject";

describe("local project folder boundary", () => {
  it("starts unbound and accepts only absolute roots", () => {
    expect(canAccessLocalFolder(unboundFolder())).toBe(false);
    expect(() => bindFolder("relative/project")).toThrow("ABSOLUTE_FOLDER_REQUIRED");
    const binding = bindFolder("/tmp/veyra-project");
    expect(binding.state).toBe("Bound");
    expect(canAccessLocalFolder(binding)).toBe(true);
  });

  it("keeps child paths inside the selected root", () => {
    const binding = bindFolder("/tmp/veyra-project");
    expect(safeChildPath(binding, "src/App.tsx")).toBe("/tmp/veyra-project/src/App.tsx");
    expect(() => safeChildPath(binding, "../secrets.txt")).toThrow("PATH_OUTSIDE_BOUND_FOLDER");
  });
});
