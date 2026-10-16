import { describe, expect, it } from "vitest";
import { persistGeneratedCloudFiles } from "./generatedCloudFiles";

describe("persistGeneratedCloudFiles", () => {
  it("writes project-relative generated files through the Cloud boundary", async () => {
    const calls: Array<{ path: string; content: string }> = [];
    const result = await persistGeneratedCloudFiles(
      [{ path: "apps/demo/src/App.tsx", content: "export default function App() { return null; }" }],
      async (filePath, content) => {
        calls.push({ path: filePath, content });
        return { path: filePath, size: content.length, updatedAt: "2026-08-17T00:00:00.000Z" };
      },
    );
    expect(calls).toHaveLength(1);
    expect(result).toEqual({ written: ["apps/demo/src/App.tsx"], rejected: [] });
  });

  it("records an unsafe generated path without writing it", async () => {
    const result = await persistGeneratedCloudFiles(
      [{ path: "../../.env", content: "no" }],
      async () => { throw new Error("PATH_OUTSIDE_WORKSPACE"); },
    );
    expect(result.written).toEqual([]);
    expect(result.rejected).toEqual([{ path: "../../.env", reason: "PATH_OUTSIDE_WORKSPACE" }]);
  });

  it("writes a repeated artifact path once using its final request-scoped content", async () => {
    const calls: Array<{ path: string; content: string }> = [];
    const result = await persistGeneratedCloudFiles(
      [
        { path: "evidence/preview-check.json", content: '{"status":"stale"}' },
        { path: "README.md", content: "Current workspace" },
        { path: "evidence/preview-check.json", content: '{"status":"current"}' },
      ],
      async (filePath, content) => {
        calls.push({ path: filePath, content });
        return { path: filePath, size: content.length, updatedAt: "2026-08-22T00:00:00.000Z" };
      },
    );

    expect(calls).toEqual([
      { path: "evidence/preview-check.json", content: '{"status":"current"}' },
      { path: "README.md", content: "Current workspace" },
    ]);
    expect(result).toEqual({ written: ["evidence/preview-check.json", "README.md"], rejected: [] });
  });
});
