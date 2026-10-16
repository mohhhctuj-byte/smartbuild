import { describe, expect, it } from "vitest";
import { createSmartBuildDiscoverySnapshot } from "./projectDiscovery";

describe("createSmartBuildDiscoverySnapshot", () => {
  it("derives project totals and redacted recent activity from factual snapshot data", () => {
    const snapshot = createSmartBuildDiscoverySnapshot([{
      project: { id: 7, name: "Atlas", description: "A real workspace", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02") },
      conversations: [{ id: 1 }, { id: 2 }],
      generatedFiles: [{ id: 1 }, { id: 2 }, { id: 3 }],
      events: [{ id: 9, eventType: "plan.created", createdAt: new Date("2026-01-03") }],
      messageCount: 12,
      sourceCount: 2,
      uploadCount: 1,
    }]);

    expect(snapshot.totals).toEqual({ projects: 1, conversations: 2, generatedFiles: 3, activities: 1 });
    expect(snapshot.projects[0]).toMatchObject({ id: 7, name: "Atlas", status: "idle", generatedFileCount: 3 });
    expect(snapshot.recentActivity[0]).toMatchObject({ projectId: 7, type: "plan.created" });
    expect(JSON.stringify(snapshot)).not.toContain("messageCount");
  });

  it("collapses historical project records into one selected logical Workspace row", () => {
    const result = createSmartBuildDiscoverySnapshot([
      { project: { id: 6210001, name: "Maya Noor Portfolio", description: "Historical", createdAt: new Date("2026-08-20"), updatedAt: new Date("2026-08-22") }, conversations: [], generatedFiles: [], events: [], messageCount: 0, sourceCount: 0, uploadCount: 0 },
      { project: { id: 6720001, name: " Maya  Noor Portfolio ", description: "Current", createdAt: new Date("2026-08-21"), updatedAt: new Date("2026-08-21") }, conversations: [{ id: 1 }], generatedFiles: [{ id: 1 }], events: [], messageCount: 0, sourceCount: 0, uploadCount: 0 },
      { project: { id: 6720002, name: "Bella Tavola Restaurant", description: "Current", createdAt: new Date("2026-08-21"), updatedAt: new Date("2026-08-21") }, conversations: [{ id: 2 }], generatedFiles: [], events: [], messageCount: 0, sourceCount: 0, uploadCount: 0 },
    ], 6720001);

    expect(result.totals.projects).toBe(2);
    expect(result.projects.map(project => project.id).sort()).toEqual([6720001, 6720002]);
  });
});
