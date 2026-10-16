import type { TaskKind } from "./taskGraph";

export type SpecialistId = "supervisor" | "builder" | "preview" | "qa" | "release";

export type SpecialistAssignment = {
  specialist: SpecialistId;
  reason: string;
  allowedKinds: TaskKind[];
  fileAttributionRequired: boolean;
};

const registry: Record<SpecialistId, SpecialistAssignment> = {
  supervisor: { specialist: "supervisor", reason: "Owns the verified task graph and selects bounded specialists.", allowedKinds: ["plan"], fileAttributionRequired: false },
  builder: { specialist: "builder", reason: "Implements only files attributed by the approved generation task.", allowedKinds: ["generate"], fileAttributionRequired: true },
  preview: { specialist: "preview", reason: "Runs the real preview boundary after generated evidence exists.", allowedKinds: ["preview"], fileAttributionRequired: false },
  qa: { specialist: "qa", reason: "Runs fixed development checks and records command evidence.", allowedKinds: ["test"], fileAttributionRequired: false },
  release: { specialist: "release", reason: "Creates a restore point only after preview and QA are verified.", allowedKinds: ["checkpoint"], fileAttributionRequired: false },
};

export function getSpecialistAssignment(specialist: string, kind: TaskKind): SpecialistAssignment {
  const assignment = registry[specialist as SpecialistId];
  if (!assignment || !assignment.allowedKinds.includes(kind)) throw new Error("SPECIALIST_NOT_ALLOWED");
  return { ...assignment, allowedKinds: [...assignment.allowedKinds] };
}

export function attributeFiles(specialist: string, kind: TaskKind, paths: string[]): { assignment: SpecialistAssignment; paths: string[] } {
  const assignment = getSpecialistAssignment(specialist, kind);
  const cleanPaths = Array.from(new Set(paths.map(path => path.trim()).filter(Boolean)));
  if (assignment.fileAttributionRequired && cleanPaths.length === 0) throw new Error("FILE_ATTRIBUTION_REQUIRED");
  return { assignment, paths: cleanPaths };
}

export function listSpecialists(): SpecialistAssignment[] {
  return Object.values(registry).map(item => ({ ...item, allowedKinds: [...item.allowedKinds] }));
}
