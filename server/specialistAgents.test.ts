import { describe, expect, it } from "vitest";
import { attributeFiles, getSpecialistAssignment, listSpecialists } from "./specialistAgents";

describe("specialist agent registry", () => {
  it("allows only the registered task kind for an agent", () => {
    expect(getSpecialistAssignment("supervisor", "plan").reason).toContain("task graph");
    expect(() => getSpecialistAssignment("builder", "plan")).toThrow("SPECIALIST_NOT_ALLOWED");
  });

  it("requires attributed files for builder work and deduplicates paths", () => {
    expect(() => attributeFiles("builder", "generate", [])).toThrow("FILE_ATTRIBUTION_REQUIRED");
    expect(attributeFiles("builder", "generate", ["src/App.tsx", "src/App.tsx"]).paths).toEqual(["src/App.tsx"]);
  });

  it("does not expose an unregistered autonomous agent", () => {
    expect(listSpecialists().map(agent => agent.specialist)).toEqual(["supervisor", "builder", "preview", "qa", "release"]);
  });
});
