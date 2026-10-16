import { describe, expect, it } from "vitest";
import { CANONICAL_MAYA_SELECTION, canonicalOwnerFallbackSelection } from "./canonicalOwnerWorkspace";

describe("canonical owner workspace restoration", () => {
  it("replaces a stale private selection with the immutable Maya selection for the bound canonical owner", () => {
    expect(canonicalOwnerFallbackSelection({
      sessionWorkspaceUserId: 4980001,
      canonicalWorkspaceUserId: 4980001,
      stored: { projectId: 7080001, conversationId: 0, buildRunId: null },
    })).toEqual(CANONICAL_MAYA_SELECTION);
  });

  it("preserves an explicit Maya or Bella owner choice", () => {
    expect(canonicalOwnerFallbackSelection({
      sessionWorkspaceUserId: 4980001,
      canonicalWorkspaceUserId: 4980001,
      stored: { projectId: 6720002, conversationId: 6510002, buildRunId: "6074749d-1c80-4507-a216-fcff5491de46" },
    })).toBeNull();
  });

  it("never chooses a canonical workspace for a different account", () => {
    expect(canonicalOwnerFallbackSelection({
      sessionWorkspaceUserId: 7020001,
      canonicalWorkspaceUserId: 4980001,
      stored: null,
    })).toBeNull();
  });
});
