import { writeFile } from "node:fs/promises";
import {
  addGeneratedFile,
  appendProjectEvent,
  claimLegacyGeneratedFilesForBuildRun,
  listGeneratedFilesForBuildRun,
  updateProjectBuildStatus,
  updateProjectDetails,
} from "../server/db";
import { exportBuildWorkspaceZip, type ArtifactLanguage } from "../server/verifiedBuildPipeline";

const persistence = {
  updateProjectDetails,
  updateProjectBuildStatus,
  addGeneratedFile: (
    ownerId: number,
    projectId: number,
    conversationId: number,
    artifact: { path: string; language: ArtifactLanguage; content: string },
    buildRunId?: string,
  ) => addGeneratedFile(ownerId, projectId, conversationId, artifact.path, artifact.language, artifact.content, buildRunId),
  listGeneratedFilesForBuildRun,
  claimLegacyGeneratedFilesForBuildRun,
  appendProjectEvent,
};

const runs = [
  { label: "maya", id: "0e5e85c2-859f-40e2-bff5-5632c3c84ca6" },
  { label: "bella", id: "6074749d-1c80-4507-a216-fcff5491de46" },
];

for (const run of runs) {
  const zip = await exportBuildWorkspaceZip(run.id, persistence);
  const output = `/home/ubuntu/${run.label}-isolation-v5.zip`;
  await writeFile(output, zip);
  console.log(JSON.stringify({ buildRunId: run.id, output, bytes: zip.length }));
}
