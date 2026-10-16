import { describe, expect, it } from "vitest";
import { dedupeCloudFiles } from "./dedupeCloudFiles";

describe("dedupeCloudFiles", () => {
  it("keeps exactly one row for repeated request-scoped artifact paths", () => {
    const files = dedupeCloudFiles([
      { path: "index.html", type: "file" as const, size: 101 },
      { path: "evidence/preview-check.json", type: "file" as const, size: 99 },
      { path: "evidence/preview-check.json", type: "file" as const, size: 99 },
      { path: "README.md", type: "file" as const, size: 80 },
    ]);

    expect(files.map(file => file.path)).toEqual(["index.html", "evidence/preview-check.json", "README.md"]);
    expect(new Set(files.map(file => file.path)).size).toBe(files.length);
  });

  it("prefers an inspectable file over a conflicting directory record", () => {
    const files = dedupeCloudFiles([
      { path: "evidence/preview-check.json", type: "directory" as const },
      { path: "evidence/preview-check.json", type: "file" as const },
    ]);

    expect(files).toEqual([{ path: "evidence/preview-check.json", type: "file" }]);
  });
});
