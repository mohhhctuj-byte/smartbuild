import { describe, expect, it } from "vitest";
import { chooseWorkspaceBuildRun, matchesWorkspaceBuildRunTuple, matchesWorkspaceProjectIdentity } from "./workspaceSelection";

const bella = { id: "bella-run", projectId: 10, conversationId: 100, status: "blocked", updatedAt: "2026-08-19T04:00:00.000Z", sourceArtifactCount: 1 };
const maya = { id: "maya-run", projectId: 11, conversationId: 110, status: "succeeded", updatedAt: "2026-08-19T05:00:00.000Z", sourceArtifactCount: 1 };

describe("chooseWorkspaceBuildRun", () => {
  it("rejects a selection that pairs a Build Run with another conversation in its project", () => {
    expect(matchesWorkspaceBuildRunTuple({ projectId: 10, conversationId: 101 }, bella)).toBe(false);
    expect(matchesWorkspaceBuildRunTuple({ projectId: 10, conversationId: 100 }, bella)).toBe(true);
  });

  it("keeps a newly selected workspace unbound instead of reattaching another project's latest run", () => {
    const result = chooseWorkspaceBuildRun({ projectId: 12, conversationId: 120, buildRunId: null }, null, [], [maya, bella]);
    expect(result).toBeNull();
  });

  it("recovers a legacy project and conversation selection when the matching conversation has a durable run", () => {
    const result = chooseWorkspaceBuildRun({ projectId: 10, conversationId: 100, buildRunId: null }, null, [bella], [maya, bella]);
    expect(result?.id).toBe("bella-run");
  });

  it("restores the latest terminal run when switching back to a project without a conversation selection", () => {
    const older = { ...bella, id: "older-run", updatedAt: "2026-08-18T04:00:00.000Z" };
    const result = chooseWorkspaceBuildRun({ projectId: 10, conversationId: null, buildRunId: null }, null, [older, bella], [maya, older, bella]);
    expect(result?.id).toBe("bella-run");
  });

  it("falls back only within the selected project when a previously selected run is stale", () => {
    const result = chooseWorkspaceBuildRun({ projectId: 10, conversationId: 100, buildRunId: "missing" }, null, [bella], [maya, bella]);
    expect(result?.id).toBe("bella-run");
  });

  it("uses the latest restorable run only when no selection has ever been persisted", () => {
    const result = chooseWorkspaceBuildRun(undefined, null, [], [bella, maya]);
    expect(result?.id).toBe("maya-run");
  });

  it("rebinds a null or stale selection to the latest terminal run for the exact conversation", () => {
    const newerInProgress = { id: "writing-run", projectId: 10, conversationId: 100, status: "writing", updatedAt: "2026-08-20T06:00:00.000Z" };
    const olderSucceeded = { id: "succeeded-run", projectId: 10, conversationId: 100, status: "succeeded", updatedAt: "2026-08-20T05:00:00.000Z", sourceArtifactCount: 1 };
    expect(chooseWorkspaceBuildRun({ projectId: 10, conversationId: 100, buildRunId: null }, null, [newerInProgress, olderSucceeded], [])?.id).toBe("succeeded-run");
    expect(chooseWorkspaceBuildRun({ projectId: 10, conversationId: 100, buildRunId: "writing-run" }, newerInProgress, [newerInProgress, olderSucceeded], [])?.id).toBe("succeeded-run");
  });

  it("restores a failed Build Run when it still contains saved website files", () => {
    const failedWithWebsite = {
      id: "failed-website",
      projectId: 10,
      conversationId: 100,
      status: "failed",
      updatedAt: "2026-08-20T06:00:00.000Z",
      sourceArtifactCount: 7,
    };
    expect(chooseWorkspaceBuildRun(
      { projectId: 10, conversationId: 100, buildRunId: "failed-website" },
      failedWithWebsite,
      [failedWithWebsite, bella],
      [],
    )?.id).toBe("failed-website");
  });

  it("restores a previewing Build Run only when its saved website has a ready preview", () => {
    const readyPreview = {
      ...bella,
      id: "ready-preview",
      status: "previewing",
      sourceArtifactCount: 7,
      previewReady: true,
    };
    const unavailablePreview = { ...readyPreview, id: "unavailable-preview", previewReady: false };
    expect(chooseWorkspaceBuildRun(
      { projectId: 10, conversationId: 100, buildRunId: "ready-preview" },
      readyPreview,
      [readyPreview, bella],
      [],
    )?.id).toBe("ready-preview");
    expect(chooseWorkspaceBuildRun(
      { projectId: 10, conversationId: 100, buildRunId: "unavailable-preview" },
      unavailablePreview,
      [unavailablePreview, bella],
      [],
    )?.id).toBe("bella-run");
  });

  it("does not restore failed or in-progress runs without saved website files", () => {
    const failedWithoutFiles = { ...bella, id: "failed-empty", status: "failed", sourceArtifactCount: 0 };
    const writingWithFiles = { ...bella, id: "writing-site", status: "writing", sourceArtifactCount: 4 };
    expect(chooseWorkspaceBuildRun(
      { projectId: 10, conversationId: 100, buildRunId: "failed-empty" },
      failedWithoutFiles,
      [failedWithoutFiles, writingWithFiles, bella],
      [],
    )?.id).toBe("bella-run");
    expect(chooseWorkspaceBuildRun(
      { projectId: 10, conversationId: 100, buildRunId: "writing-site" },
      writingWithFiles,
      [writingWithFiles],
      [],
    )).toBeNull();
    expect(chooseWorkspaceBuildRun(
      { projectId: 10, conversationId: 100, buildRunId: "empty-blocked" },
      { ...bella, id: "empty-blocked", sourceArtifactCount: 0 },
      [{ ...bella, id: "empty-blocked", sourceArtifactCount: 0 }],
      [],
    )).toBeNull();
  });

  it("quarantines a named Maya or Bella run when its durable project identity names the other fixture", () => {
    expect(matchesWorkspaceProjectIdentity("Bella Tavola", "Maya Noor Portfolio")).toBe(false);
    expect(matchesWorkspaceProjectIdentity("Maya Noor Portfolio", "Bella Tavola")).toBe(false);
    expect(matchesWorkspaceProjectIdentity("Maya Noor Portfolio", "Maya Noor Portfolio")).toBe(true);
    expect(matchesWorkspaceProjectIdentity("Workspace 42", "Maya Noor Portfolio")).toBe(true);
  });
});
