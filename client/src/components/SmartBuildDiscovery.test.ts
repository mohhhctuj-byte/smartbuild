import { describe, expect, it } from "vitest";
import { sortDiscoveryProjects, type DiscoveryProject } from "./SmartBuildDiscovery";

const projects: DiscoveryProject[] = [
  { id: 1, name: "Zebra", description: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", conversationCount: 0, generatedFileCount: 0, activityCount: 0, status: "new" },
  { id: 2, name: "Alpha", description: null, createdAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-03T00:00:00.000Z", conversationCount: 1, generatedFileCount: 2, activityCount: 3, status: "active" },
  { id: 3, name: "Build", description: null, createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", conversationCount: 1, generatedFileCount: 1, activityCount: 1, status: "active" },
];

describe("SmartBuild discovery project sorting", () => {
  it("orders factual project rows by name, status, and update date without mutating input", () => {
    expect(sortDiscoveryProjects(projects, "name", "asc").map(project => project.name)).toEqual(["Alpha", "Build", "Zebra"]);
    expect(sortDiscoveryProjects(projects, "status", "asc").map(project => project.name)).toEqual(["Alpha", "Build", "Zebra"]);
    expect(sortDiscoveryProjects(projects, "updatedAt", "desc").map(project => project.name)).toEqual(["Alpha", "Build", "Zebra"]);
    expect(projects.map(project => project.name)).toEqual(["Zebra", "Alpha", "Build"]);
  });
});
