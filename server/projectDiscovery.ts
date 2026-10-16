import type { ProjectReportSnapshot } from "./projectReport";
import { collapseLogicalWorkspaceProjects } from "./workspaceProjectList";

type ActivityEvent = { id?: number; eventType?: string; createdAt?: Date | string | null };

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export type SmartBuildDiscoverySnapshot = {
  totals: { projects: number; conversations: number; generatedFiles: number; activities: number };
  projects: Array<{
    id: number;
    name: string;
    description: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    archivedAt: string | null;
    conversationCount: number;
    generatedFileCount: number;
    activityCount: number;
    status: "idle" | "planned" | "writing" | "previewing" | "testing" | "verifying" | "succeeded" | "failed" | "blocked" | "timed_out" | "cancelled";
  }>;
  recentActivity: Array<{ id: string; projectId: number; projectName: string; type: string; occurredAt: string | null }>;
};

/** Builds a redacted discovery view. Event payloads and message bodies never leave the server. */
export function createSmartBuildDiscoverySnapshot(snapshots: ProjectReportSnapshot[], preferredProjectId?: number | null): SmartBuildDiscoverySnapshot {
  const logicalSnapshots = collapseLogicalWorkspaceProjects(
    snapshots.map(snapshot => ({ ...snapshot.project, snapshot })),
    preferredProjectId,
  ).map(row => row.snapshot);

  const projects = logicalSnapshots.map(snapshot => {
    const events = snapshot.events as ActivityEvent[];
    const latestEvent = events.at(-1);
    return {
      id: snapshot.project.id,
      name: snapshot.project.name,
      description: snapshot.project.description ?? null,
      createdAt: iso(snapshot.project.createdAt),
      updatedAt: iso(latestEvent?.createdAt) ?? iso(snapshot.project.updatedAt) ?? iso(snapshot.project.createdAt),
      archivedAt: iso((snapshot.project as { archivedAt?: Date | string | null }).archivedAt),
      conversationCount: snapshot.conversations.length,
      generatedFileCount: snapshot.generatedFiles.length,
      activityCount: events.length,
      status: snapshot.project.buildStatus ?? "idle",
    };
  }).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  const recentActivity = logicalSnapshots.flatMap(snapshot => (snapshot.events as ActivityEvent[]).map((event, index) => ({
    id: `${snapshot.project.id}:${event.id ?? index}`,
    projectId: snapshot.project.id,
    projectName: snapshot.project.name,
    type: event.eventType || "workspace.activity",
    occurredAt: iso(event.createdAt),
  }))).sort((a, b) => (b.occurredAt || "").localeCompare(a.occurredAt || "")).slice(0, 8);

  return {
    totals: {
      projects: logicalSnapshots.length,
      conversations: logicalSnapshots.reduce((total, snapshot) => total + snapshot.conversations.length, 0),
      generatedFiles: logicalSnapshots.reduce((total, snapshot) => total + snapshot.generatedFiles.length, 0),
      activities: logicalSnapshots.reduce((total, snapshot) => total + snapshot.events.length, 0),
    },
    projects,
    recentActivity,
  };
}
