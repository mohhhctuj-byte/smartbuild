import { describe, expect, it } from "vitest";
import { sortDiscoveryProjects } from "../shared/discoverySort";

const projects = [
  { name: "Zeta", status: "new", updatedAt: "2026-08-16T10:00:00.000Z" },
  { name: "Alpha", status: "active", updatedAt: "2026-08-17T10:00:00.000Z" },
  { name: "Beta", status: "active", updatedAt: null },
];

describe("sortDiscoveryProjects", () => {
  it("orders a copied project list by name, status, and recorded activity date", () => {
    expect(sortDiscoveryProjects(projects, "name", "asc").map(project => project.name)).toEqual(["Alpha", "Beta", "Zeta"]);
    expect(sortDiscoveryProjects(projects, "status", "asc").map(project => project.name)).toEqual(["Alpha", "Beta", "Zeta"]);
    expect(sortDiscoveryProjects(projects, "updatedAt", "desc").map(project => project.name)).toEqual(["Alpha", "Zeta", "Beta"]);
    expect(projects.map(project => project.name)).toEqual(["Zeta", "Alpha", "Beta"]);
  });
});
