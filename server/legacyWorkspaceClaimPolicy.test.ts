import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { legacyWorkspaceClaimPolicy } from "./legacyWorkspaceClaimPolicy";

describe("legacy workspace claim policy", () => {
  const personalAccount = { emailVerified: true, userId: 71001, workspaceUserId: null };

  it("distinguishes unavailable, claimable, claimed, and owner-recovery states without workspace data", () => {
    expect(legacyWorkspaceClaimPolicy({ account: { ...personalAccount, emailVerified: false }, canonicalUserId: 672001 })).toBe("unavailable");
    expect(legacyWorkspaceClaimPolicy({ account: personalAccount, canonicalUserId: 672001 })).toBe("claimable");
    expect(legacyWorkspaceClaimPolicy({ account: { ...personalAccount, workspaceUserId: 672001 }, canonicalUserId: 672001 })).toBe("claimed");
    expect(legacyWorkspaceClaimPolicy({ account: personalAccount, canonicalUserId: 672001, claimExists: true })).toBe("recovery_required");
    expect(legacyWorkspaceClaimPolicy({ account: personalAccount, canonicalUserId: 672001, verifiedOwnerExists: true })).toBe("recovery_required");
  });

  it("keeps the claim transaction limited to the account binding and the immutable audit record", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/db.ts"), "utf8");
    const claimTransaction = source.slice(source.indexOf("await db.transaction"), source.indexOf("return { state: \"claimed\""));
    const sessionResolver = source.slice(source.indexOf("export async function getFirstPartySessionUser"), source.indexOf("export async function getFirstPartySessionAccount"));

    expect(claimTransaction).toContain("tx.update(authAccounts).set({ workspaceUserId: canonical.id })");
    expect(claimTransaction).toContain("tx.insert(legacyWorkspaceClaims).values({ canonicalUserId: canonical.id, claimedByAccountId: accountId })");
    expect(claimTransaction).not.toMatch(/tx\.(insert|update|delete)\((projects|conversations|buildRuns|generatedFiles|messages)/);
    expect(claimTransaction).not.toContain("authSessions");
    expect(sessionResolver).toContain("row[0].account.workspaceUserId ?? row[0].account.userId");
    expect(sessionResolver).toContain("getUserById(workspaceUserId)");
  });
});
