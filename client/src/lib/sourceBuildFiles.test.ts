import { describe, expect, it } from "vitest";
import { sourceBuildFiles } from "./sourceBuildFiles";

describe("sourceBuildFiles", () => {
  it("keeps only source files and excludes internal build artifacts", () => {
    const files = sourceBuildFiles([
      { path: "src/App.tsx", type: "file" as const },
      { path: "README.md", type: "file" as const },
      { path: "index.html", type: "file" as const },
      { path: "agent-artifacts/worker-output.json", type: "file" as const },
      { path: "evidence/build-plan.json", type: "file" as const },
      { path: "checkpoints/manifest.json", type: "file" as const },
      { path: "exports/run.zip", type: "file" as const },
      { path: "logs/worker.log", type: "file" as const },
      { path: "traces/agent-trace.json", type: "file" as const },
      { path: ".smartbuild/session.json", type: "file" as const },
      { path: "src", type: "directory" as const },
    ]);

    expect(files.map(file => file.path)).toEqual(["README.md", "index.html", "src/App.tsx"]);
  });
});
