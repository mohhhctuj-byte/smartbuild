import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = fs.readFileSync(path.join(process.cwd(), "server/_core/index.ts"), "utf8");

describe("legacy workspace claim route", () => {
  it("derives claim eligibility exclusively from the verified first-party account", () => {
    const routes = serverSource.slice(
      serverSource.indexOf('app.get("/api/workspace/legacy-claim"'),
      serverSource.indexOf('app.post("/api/personal/bootstrap"'),
    );

    expect(routes).toContain("requireVerifiedFirstPartyAccount(req, res)");
    expect(routes).toContain("getLegacyWorkspaceClaimState(account.id)");
    expect(routes).toContain("claimLegacyWorkspaceForAccount(account.id)");
    expect(routes).not.toContain("projectId");
    expect(routes).not.toContain("conversationId");
    expect(routes).not.toContain("buildRunId");
    expect(routes).not.toContain("req.body");
  });
});
