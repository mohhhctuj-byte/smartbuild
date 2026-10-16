import { describe, expect, it } from "vitest";
import { collapseLogicalWorkspaceProjects, logicalWorkspaceProjectKey } from "./workspaceProjectList";

describe("collapseLogicalWorkspaceProjects", () => {
  const mayaCurrent = { id: 6720001, name: "Maya Noor Portfolio", updatedAt: new Date("2026-08-21T10:00:00Z") };
  const bellaCurrent = { id: 6720002, name: "Bella Tavola Restaurant", updatedAt: new Date("2026-08-21T10:00:00Z") };

  it("exposes one current logical row for Maya and Bella while keeping the selected row", () => {
    const rows = collapseLogicalWorkspaceProjects([
      { id: 6200001, name: "Maya  Noor Portfolio", updatedAt: new Date("2026-08-22T10:00:00Z") },
      mayaCurrent,
      { id: 6200002, name: "Bella Tavola Restaurant", updatedAt: new Date("2026-08-22T10:00:00Z") },
      bellaCurrent,
    ], mayaCurrent.id);

    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.id)).toContain(mayaCurrent.id);
    expect(rows.map(row => row.id)).toContain(6200002);
  });

  it("uses the latest project deterministically when no selection is saved", () => {
    const rows = collapseLogicalWorkspaceProjects([
      { id: 1, name: "Maya Noor Portfolio", updatedAt: new Date("2026-08-20T10:00:00Z") },
      { id: 2, name: " maya noor   portfolio ", updatedAt: new Date("2026-08-21T10:00:00Z") },
    ]);

    expect(rows.map(row => row.id)).toEqual([2]);
    expect(logicalWorkspaceProjectKey(" Maya  Noor Portfolio ", 1)).toBe(logicalWorkspaceProjectKey("maya noor portfolio", 2));
  });

  it("collapses invisible Unicode variants of one logical project", () => {
    const rows = collapseLogicalWorkspaceProjects([
      { id: 6720001, name: "Maya Noor Portfolio", updatedAt: new Date("2026-08-25T10:00:00Z") },
      { id: 6720003, name: "Maya\u200b Noor Portfolio", updatedAt: new Date("2026-08-25T11:00:00Z") },
      { id: 6720002, name: "Bella Tavola Restaurant", updatedAt: new Date("2026-08-25T09:00:00Z") },
    ]);

    expect(rows.map(row => row.id)).toEqual([6720003, 6720002]);
  });

  it("collapses the known Bella historical alias without collapsing unrelated projects", () => {
    const rows = collapseLogicalWorkspaceProjects([
      { id: 6720002, name: "Bella Tavola", updatedAt: new Date("2026-08-20T10:00:00Z") },
      { id: 6720004, name: "Restaurant Landing Page", updatedAt: new Date("2026-08-25T10:00:00Z") },
      { id: 6720005, name: "Workspace 4", updatedAt: new Date("2026-08-25T11:00:00Z") },
    ]);

    expect(rows.map(row => row.id)).toEqual([6720005, 6720004]);
    expect(logicalWorkspaceProjectKey("Bella Tavola", 6720002)).toBe(logicalWorkspaceProjectKey("Restaurant Landing Page", 6720004));
    expect(logicalWorkspaceProjectKey("Workspace 4", 6720005)).not.toBe(logicalWorkspaceProjectKey("Restaurant Landing Page", 6720004));
  });
});
