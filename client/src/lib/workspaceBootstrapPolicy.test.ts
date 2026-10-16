import { describe, expect, it } from "vitest";
import { MISSING_PERSISTED_WORKSPACE_MESSAGE, workspaceBootstrapPolicy } from "./workspaceBootstrapPolicy";

describe("workspaceBootstrapPolicy", () => {
  it("never creates a personal workspace while restoring a persisted owner session", () => {
    expect(workspaceBootstrapPolicy(false)).toEqual({
      bootstrapPersonalSession: false,
      createProject: false,
      createConversation: false,
    });
  });

  it("permits provisioning only after the user explicitly chooses New Workspace", () => {
    expect(workspaceBootstrapPolicy(true)).toEqual({
      bootstrapPersonalSession: true,
      createProject: true,
      createConversation: true,
    });
  });

  it("keeps the missing-owner-state explanation explicit", () => {
    expect(MISSING_PERSISTED_WORKSPACE_MESSAGE).toContain("Existing Build Runs were not changed");
  });
});
