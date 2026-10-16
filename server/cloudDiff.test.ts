import { describe, expect, it } from "vitest";
import { CloudDiffError, readCloudRevisionDiff, type GitRunner } from "./cloudDiff";

const revisions = ["a1b2c3d", "d4e5f6a"];

describe("Cloud revision diff", () => {
  it("only renders diffs for revisions in the bounded Cloud log", async () => {
    const calls: string[][] = [];
    const run: GitRunner = async args => {
      calls.push(args);
      if (args[0] === "log") return revisions.join("\n");
      return "diff --git a/client/App.tsx b/client/App.tsx\n+const mode = 'cloud';\n";
    };
    await expect(readCloudRevisionDiff("a1b2c3d", run)).resolves.toMatchObject({ revision: "a1b2c3d", truncated: false });
    expect(calls[1]).toEqual(["show", "--format=", "--no-ext-diff", "--unified=3", "a1b2c3d", "--", "."]);
  });

  it("rejects non-log revisions before issuing git show", async () => {
    const run: GitRunner = async args => args[0] === "log" ? revisions.join("\n") : "unexpected";
    await expect(readCloudRevisionDiff("deadbee", run)).rejects.toMatchObject<Partial<CloudDiffError>>({ code: "REVISION_UNAVAILABLE" });
    await expect(readCloudRevisionDiff("HEAD~1", run)).rejects.toMatchObject<Partial<CloudDiffError>>({ code: "INVALID_REVISION" });
  });
});
