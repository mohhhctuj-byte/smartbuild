import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "smartbuild-contact-retest-"));
process.env.SMARTBUILD_WORKSPACE_ROOT = workspaceRoot;

const pipeline = await import("../server/verifiedBuildPipeline.ts");
const reportPath = path.resolve("verification/contact-form-capability-report.json");
const request = "Build a contact page with a real form. Validate name, email, and message fields, show real validation errors, submit to a backend endpoint, save the submission in the project database, and create Playwright tests. Do not use mock data or fake success messages. If the database or email provider is missing, mark that part BLOCKED and explain exactly what is missing.";
const statuses = [];
const persistence = {
  updateProjectDetails: async () => undefined,
  updateProjectBuildStatus: async (_userId, _projectId, status) => { statuses.push(status); },
  addGeneratedFile: async () => 1,
  appendProjectEvent: async () => undefined,
};

try {
  const run = await pipeline.runVerifiedBuild({ userId: 9901, projectId: 9902, conversationId: 9903, request, persistence, gitExecutable: null });
  const testOutput = JSON.parse(await readFile(path.join(run.workspaceRoot, "evidence", "test-output.json"), "utf8"));
  const report = {
    request,
    status: run.status,
    template: run.contract.template,
    artifactFiles: run.artifacts.map(artifact => artifact.path),
    acceptanceCriteria: run.test?.results || [],
    checkpoint: run.checkpoint || null,
    error: run.error || null,
    statusTransitions: statuses,
    testOutput,
    generatedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  await pipeline.stopBuildPreview(run.id);
  console.log(JSON.stringify(report, null, 2));
  const requiredPass = ["backend-post-endpoint", "database-schema-persistence", "playwright-tests"];
  if (run.status !== "succeeded" || !run.checkpoint || !requiredPass.every(id => run.test?.results.some(result => result.criterionId === id && result.status === "PASS")) || run.test?.results.some(result => result.status !== "PASS")) process.exitCode = 1;
} finally {
  await rm(workspaceRoot, { recursive: true, force: true });
}
