import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createQaAgentReport } from "./qaAgentGateway";
import { createRequestSpecificArtifacts } from "./projectGeneration";
import { AI_MODEL_IDS } from "@shared/aiModels";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "smartbuild-verified-build-"));
process.env.SMARTBUILD_WORKSPACE_ROOT = testRoot;

const productionPipeline = await import("./verifiedBuildPipeline");
const pipeline = {
  ...productionPipeline,
  createProjectFromRequest: (input: Parameters<typeof productionPipeline.createProjectFromRequest>[0]) =>
    productionPipeline.createProjectFromRequest({
      ...input,
      executionMode: input.executionMode ?? "legacy-template",
    }),
  runVerifiedBuild: (input: Parameters<typeof productionPipeline.runVerifiedBuild>[0]) =>
    productionPipeline.runVerifiedBuild({
      ...input,
      executionMode: input.executionMode ?? "legacy-template",
    }),
};
const { buildAgentExecutionEvidence } = await import("./agentExecutionEvidence");
const { agentExecutionEvidencePath } = await import("./agentExecutionEvidencePath");
const { WEBSITE_BUILDER_AGENT_ID } = await import("./websiteBuilderAgent");
const completedRuns: string[] = [];

describe("project database workspace path", () => {
  it("persists a site's database across builds while isolating other projects", () => {
    const firstBuild = productionPipeline.buildWorkspacePath(709, 809, "first");
    const nextBuild = productionPipeline.buildWorkspacePath(709, 809, "next");
    const otherProject = productionPipeline.buildWorkspacePath(710, 810, "first");
    const firstDatabase = productionPipeline.projectDatabasePathForWorkspace(firstBuild);
    expect(productionPipeline.projectDatabasePathForWorkspace(nextBuild)).toBe(firstDatabase);
    expect(productionPipeline.projectDatabasePathForWorkspace(otherProject)).not.toBe(firstDatabase);
  });
});

describe("preview document validation", () => {
  it("accepts a valid HTML page with a rendered body even when it uses a div-based app shell", () => {
    expect(productionPipeline.isRenderablePreviewDocument(
      "<!doctype html><html><head><title>Sign in</title></head><body><div id=\"app\">Sign in</div></body></html>",
    )).toBe(true);
    expect(productionPipeline.isRenderablePreviewDocument(
      "<!doctype html><title>Sign in</title><main id=\"app\">Sign in</main>",
    )).toBe(true);
  });

  it("rejects an empty document or one without rendered body content", () => {
    expect(productionPipeline.isRenderablePreviewDocument("<html><body> </body></html>")).toBe(false);
    expect(productionPipeline.isRenderablePreviewDocument("<div id=\"app\">Sign in</div>")).toBe(false);
  });
});

function persistenceRecorder() {
  const projectUpdates: Array<{ userId: number; projectId: number; name: string; description: string }> = [];
  const buildStatuses: string[] = [];
  const writtenArtifacts: Array<{ userId: number; buildRunId?: string; path: string; content: string }> = [];
  const events: Array<{ eventType: string; payload: unknown }> = [];
  const savedRuns: Array<{ id: string; status: string; checkpoint: boolean; evidenceCount: number; artifactCount: number }> = [];
  return {
    projectUpdates,
    buildStatuses,
    writtenArtifacts,
    events,
    savedRuns,
    persistence: {
      updateProjectDetails: async (userId: number, projectId: number, details: { name: string; description: string }) => { projectUpdates.push({ userId, projectId, ...details }); },
      updateProjectBuildStatus: async (_userId: number, _projectId: number, status: string) => { buildStatuses.push(status); },
      addGeneratedFile: async (userId: number, _projectId: number, _conversationId: number, artifact: { path: string; content: string }, buildRunId?: string) => { writtenArtifacts.push({ userId, buildRunId, path: artifact.path, content: artifact.content }); return writtenArtifacts.length; },
      listGeneratedFilesForBuildRun: async (userId: number, buildRunId: string) => writtenArtifacts.filter(file => file.userId === userId && file.buildRunId === buildRunId),
      deleteGeneratedFileForBuildRun: async (userId: number, _projectId: number, _conversationId: number, buildRunId: string, filePath: string) => {
        const index = writtenArtifacts.findIndex(file => file.userId === userId && file.buildRunId === buildRunId && file.path === filePath);
        if (index < 0) return false;
        writtenArtifacts.splice(index, 1);
        return true;
      },
      appendProjectEvent: async (_userId: number, _projectId: number, eventType: string, payload: unknown) => { events.push({ eventType, payload }); },
      saveBuildRun: async run => { savedRuns.push({ id: run.id, status: run.status, checkpoint: Boolean(run.checkpoint), evidenceCount: run.evidence.length, artifactCount: run.artifacts.length }); },
    },
  };
}

describe("Build Run request journey", () => {
  it("uses an AI-generated workspace name without changing the build contract name", async () => {
    const recorder = persistenceRecorder();
    const generateWorkspaceName = async (request: string, model?: typeof AI_MODEL_IDS.claude) => {
      expect(request).toContain("login page");
      expect(model).toBe(AI_MODEL_IDS.claude);
      return "Keyhaven";
    };
    const run = await productionPipeline.createProjectFromRequest({
      userId: 798,
      projectId: 898,
      conversationId: 998,
      request: "Build a polished login page with secure sign-in and recovery.",
      persistence: {
        ...recorder.persistence,
        getProjectName: async () => "Workspace 10",
        generateWorkspaceName,
      },
      executionMode: "production-agent-queue",
      model: AI_MODEL_IDS.claude,
    });

    expect(run.workspaceName).toBe("Keyhaven");
    expect(run.workspaceNameError).toBeUndefined();
    expect(run.contract.projectName).toBe("Accessly");
  });

  it("preserves a user-named workspace instead of replacing it with an AI title", async () => {
    const recorder = persistenceRecorder();
    const generateWorkspaceName = async () => {
      throw new Error("A user-named workspace must not be renamed.");
    };
    const run = await productionPipeline.createProjectFromRequest({
      userId: 798,
      projectId: 898,
      conversationId: 998,
      request: "Build a polished login page.",
      persistence: {
        ...recorder.persistence,
        getProjectName: async () => "My custom workspace",
        generateWorkspaceName,
      },
    });

    expect(run.workspaceName).toBeUndefined();
    expect(run.workspaceNameError).toBeUndefined();
  });

  it("keeps an explicit neutral name and warning when the AI name request fails", async () => {
    const recorder = persistenceRecorder();
    const run = await productionPipeline.createProjectFromRequest({
      userId: 798,
      projectId: 898,
      conversationId: 998,
      request: "Build a polished login page.",
      persistence: {
        ...recorder.persistence,
        getProjectName: async () => "Workspace 10",
        generateWorkspaceName: async () => { throw new Error("AI unavailable"); },
      },
    });

    expect(run.workspaceName).toBe("New project");
    expect(run.workspaceNameError).toMatch(/AI could not generate a workspace name/);
  });

  it("retains an explicitly selected Claude model on the tracked Build Run", async () => {
    const recorder = persistenceRecorder();
    const run = await productionPipeline.createProjectFromRequest({
      userId: 798,
      projectId: 898,
      conversationId: 998,
      request: "Build a responsive product website.",
      persistence: recorder.persistence,
      executionMode: "production-agent-queue",
      model: AI_MODEL_IDS.claude,
    });

    expect(run.model).toBe(AI_MODEL_IDS.claude);
  });

  it("starts inspection under the same durable request identifier", async () => {
    const recorder = persistenceRecorder();
    const requestId = "journey-request";
    const buildId = "server-generated-run-id";
    const run = await productionPipeline.createProjectFromRequest({
      userId: 798,
      projectId: 898,
      conversationId: 998,
      buildId,
      requestId,
      request: "Build a responsive sign-in page with email and password fields.",
      persistence: recorder.persistence,
    });

    expect(run.journeyEvents).toEqual([
      expect.objectContaining({
        requestId,
        sequence: 1,
        stage: "inspection",
        state: "in_progress",
      }),
    ]);
    expect(run.id).toBe(buildId);
    expect(run.requestId).toBe(requestId);
    expect(recorder.savedRuns[0].id).toBe(buildId);
    await productionPipeline.updateProjectStatus(run, recorder.persistence, "writing", "Production task plan is ready.");
    await productionPipeline.updateProjectStatus(run, recorder.persistence, "previewing", "Saved project files are ready for verification.");
    await productionPipeline.updateProjectStatus(run, recorder.persistence, "previewing", "Resumed while preview startup is still in progress.");
    await productionPipeline.updateProjectStatus(run, recorder.persistence, "verifying", "Preview and acceptance checks passed.");
    await productionPipeline.updateProjectStatus(run, recorder.persistence, "succeeded", "Verified delivery checkpoint is ready.");
    expect(run.journeyEvents?.map(({ requestId: eventRequestId, stage, state }) => [eventRequestId, stage, state])).toEqual([
      [requestId, "inspection", "in_progress"],
      [requestId, "inspection", "completed"],
      [requestId, "planning", "completed"],
      [requestId, "execution", "in_progress"],
      [requestId, "execution", "completed"],
      [requestId, "verification", "in_progress"],
      [requestId, "verification", "completed"],
      [requestId, "delivery", "in_progress"],
      [requestId, "delivery", "completed"],
    ]);
    expect(recorder.events.filter(event => event.eventType === "build.status").every(event =>
      typeof event.payload === "object" && event.payload !== null && "requestId" in event.payload && event.payload.requestId === requestId,
    )).toBe(true);
    await productionPipeline.forgetBuildRun(run.id);
  });
});

function prepareCheckpointReleaseGate(run: Awaited<ReturnType<typeof productionPipeline.createProjectFromRequest>>) {
  const createdAt = new Date().toISOString();
  run.status = "verifying";
  run.preview = {
    url: "http://127.0.0.1:1/",
    proxyUrl: `/api/build-runs/${run.id}/preview/`,
    port: 1,
    checkedAt: createdAt,
    assets: [{ path: "index.html", status: 200, contentType: "text/html", bytes: 1, passed: true }],
  };
  run.test = {
    passed: true,
    checks: ["PASS: checkpoint release gate fixture"],
    outputPath: "evidence/test-output.json",
    checkedAt: createdAt,
    results: run.contract.acceptanceCriteria.map(criterion => ({
      criterionId: criterion.id,
      criterion: criterion.title,
      capability: criterion.capability,
      status: "PASS" as const,
      evidence: "Scoped release-gate fixture.",
    })),
  };
  run.agentOrchestration = { registryCount: 300, executionMode: "dry-run", checkpointAllowed: true, selectedAgents: [], skippedAgents: [], tasks: [], blockedReason: null };
  run.syntheticEvaluation = {
    enabled: true, execution_policy: "sequential", max_concurrency: 1, functional_user_first: true, visual_user_second: true, run_after_implementation: true, run_before_verification: true,
    rerun_after_repair: true, max_repair_cycles: 3, require_evidence_for_bug: true, block_checkpoint_on_critical_or_high: true, allow_unapproved_external_side_effects: false,
    runs: [
      { evaluator_instance: "functional_synthetic_user", status: "PASS", started_at: createdAt, completed_at: createdAt, actions: [{ route: "/", step: "verify-main-interaction", passed: true }], evidence_paths: ["evidence/evaluators/functional.json"], screenshot_paths: [], console_errors: [], network_failures: [] },
      {
        evaluator_instance: "visual_synthetic_user", status: "PASS", started_at: createdAt, completed_at: createdAt,
        actions: ["desktop", "tablet", "mobile"].map(viewport => ({ route: "/", step: `${viewport}-viewport`, passed: true })),
        evidence_paths: [
          "evidence/evaluators/visual.json",
          "evidence/evaluators/visual-desktop.png",
          "evidence/evaluators/visual-tablet.png",
          "evidence/evaluators/visual-mobile.png",
        ],
        screenshot_paths: [
          "evidence/evaluators/visual-desktop.png",
          "evidence/evaluators/visual-tablet.png",
          "evidence/evaluators/visual-mobile.png",
        ],
        console_errors: [], network_failures: [],
      },
    ],
    bugs: [], repair_tasks: [], repair_cycles: 0, checkpoint_allowed: true, final_status: "PASS", output_path: "evidence/evaluators/synthetic-evaluation.json",
  };
  const evaluatorEvidencePaths = [
    "evidence/evaluators/functional.json",
    "evidence/evaluators/visual.json",
    "evidence/evaluators/visual-desktop.png",
    "evidence/evaluators/visual-tablet.png",
    "evidence/evaluators/visual-mobile.png",
  ];
  for (const evidencePath of evaluatorEvidencePaths) {
    run.evidence.push({ path: evidencePath, kind: "evaluation", createdAt });
  }
  run.qaAgentReport = createQaAgentReport({
    buildRunId: run.id,
    evaluation: run.syntheticEvaluation,
    reviewedAt: createdAt,
    previewVerified: true,
    availableEvidencePaths: evaluatorEvidencePaths,
  });
  for (const [path, kind] of [
    ["evidence/requirement-contract.json", "requirements"],
    ["evidence/build-plan.json", "plan"],
    ["evidence/preview-check.json", "preview"],
    ["evidence/test-output.json", "test"],
    ["evidence/evaluators/synthetic-evaluation.json", "evaluation"],
    ["evidence/qa-agent-report.json", "evaluation"],
    ["evidence/build-summary.json", "evaluation"],
  ] as const) {
    if (!run.evidence.some(item => item.path === path)) run.evidence.push({ path, kind, createdAt });
  }
}

describe("verified Cloud build pipeline", () => {
  it("requires a persisted dashboard only when the requested product calls for one", () => {
    expect(productionPipeline.requestRequiresProjectDashboard("Build a responsive sign-in screen with a demo-only success state.")).toBe(false);
    expect(productionPipeline.requestRequiresProjectDashboard("Build a logistics analytics dashboard with shipment filters.")).toBe(true);
    expect(productionPipeline.requestRequiresProjectDashboard("Build a portfolio; do not add a dashboard.")).toBe(false);
  });

  it("requires the persisted project-specific dashboard only for production-agent builds", () => {
    const request = "Build an online store with products and orders.";
    const legacy = productionPipeline.parseRequirementContract(request);
    const production = productionPipeline.parseRequirementContract(request, { includeProjectDashboard: true });

    expect(legacy.acceptanceCriteria.map(item => item.id)).not.toContain("project-dashboard-data");
    expect(production.acceptanceCriteria).toContainEqual(expect.objectContaining({
      id: "project-dashboard-data",
      capability: "database",
      required: true,
    }));
    expect(production.productSpec?.dataModels.map(model => model.name)).toEqual(expect.arrayContaining(["Product", "CartLine"]));
  });

  it("defaults a newly created Build Run to the durable production agent queue", async () => {
    const record = persistenceRecorder();
    const run = await productionPipeline.createProjectFromRequest({
      userId: 789,
      projectId: 889,
      conversationId: 989,
      buildId: "default-production-agent-queue",
      request: "Build a concise product overview page for a scheduling tool.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);

    expect(run.executionMode).toBe("production-agent-queue");
    expect(run.artifacts).toHaveLength(0);
  });

  it("creates production manifests for every supported product category", async () => {
    const record = persistenceRecorder();
    const requests = [
      {
        buildId: "contact-production-manifest",
        request: "Build a contact page with a message form.",
        category: "contact",
      },
      {
        buildId: "restaurant-production-manifest",
        request: "Build a restaurant website for Bella Tavola with a menu and reservations.",
        category: "restaurant",
      },
    ] as const;

    for (const item of requests) {
      const run = await productionPipeline.createProjectFromRequest({
        userId: 789,
        projectId: 889,
        conversationId: 989,
        buildId: item.buildId,
        request: item.request,
        persistence: record.persistence,
      });
      completedRuns.push(run.id);

      expect(run.contract.classification?.category).toBe(item.category);
      expect(run.manifest?.files.map(file => file.role)).toContain("entry");
      expect(run.manifest?.files.map(file => file.role)).toContain("style");
      expect(run.manifest?.files.map(file => file.role)).toContain("logic");
      expect(run.manifest?.files.map(file => file.role)).toContain("data");
    }
  });

  it("restores the 100-file baseline alongside sparse production-agent output", async () => {
    const record = persistenceRecorder();
    const run = await productionPipeline.createProjectFromRequest({
      userId: 789,
      projectId: 889,
      conversationId: 989,
      buildId: "restaurant-agent-baseline",
      request: "Build a warm responsive cafe website with a menu, opening hours, location, and pickup order form.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    const generated = createRequestSpecificArtifacts(run.contract.productSpec!, run.manifest!);
    const agentPaths = new Set(["index.html", "src/restaurant.js", "data/restaurant.json", "README.md", "project.manifest.json"]);
    const stylePath = run.manifest!.files.find(file => file.role === "style")?.path;
    expect(stylePath).toBeTruthy();
    agentPaths.add(stylePath!);
    for (const artifact of generated.filter(item => agentPaths.has(item.path))) {
      const content = artifact.path === "project.manifest.json"
        ? JSON.stringify({ ...run.manifest, files: run.manifest!.files.slice(0, 6) })
        : artifact.content;
      await record.persistence.addGeneratedFile(run.userId, run.projectId, run.conversationId, { ...artifact, content }, run.id);
    }
    await record.persistence.addGeneratedFile(run.userId, run.projectId, run.conversationId, {
      path: "src/agent-feature.js",
      language: "javascript",
      content: "export const agentFeature = true;",
    }, run.id);

    await productionPipeline.ensureProductionSourceArtifacts(run, record.persistence);

    const persistedFiles = await record.persistence.listGeneratedFilesForBuildRun!(run.userId, run.id);
    expect(run.manifest?.files.length).toBeGreaterThanOrEqual(100);
    expect(run.manifest?.files.length).toBeLessThanOrEqual(200);
    expect(run.artifacts.length).toBeGreaterThanOrEqual(100);
    expect(run.manifest?.files.map(file => file.path)).toContain("src/agent-feature.js");
    expect(persistedFiles.length).toBeGreaterThanOrEqual(100);
    const savedManifest = JSON.parse(await readFile(path.join(run.workspaceRoot, "project.manifest.json"), "utf8")) as { files: Array<{ path: string }> };
    expect(savedManifest.files.length).toBe(run.manifest?.files.length);
  });

  it("uses the reading-club modules in its request-specific feature contract", () => {
    const contract = productionPipeline.parseRequirementContract("Build an online reading club for 24 members with books and meetups.");
    const generatedPaths = new Set(["index.html", "styles.css", "app.js", "src/data/club-data.mjs"]);

    expect(contract.classification?.category).toBe("social_network");
    expect(contract.featureContract?.features.map(feature => feature.id)).toEqual([
      "book-shelf", "book-search", "reading-progress", "meetup-rsvp", "member-roster",
    ]);
    expect(contract.featureContract?.features.every(feature => feature.requiredFiles.every(file => generatedPaths.has(file)))).toBe(true);
  });

  it("removes a deleted Build Run from the in-memory preview registry", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 701,
      projectId: 802,
      conversationId: 903,
      request: "Create a short personal portfolio page.",
      persistence: record.persistence,
    });

    expect(productionPipeline.getBuildRun(run.id)).toBe(run);
    await productionPipeline.forgetBuildRun(run.id);
    expect(productionPipeline.getBuildRun(run.id)).toBeUndefined();
  });

  it("recognizes an accented café request and preserves its named identity and local order requirements", () => {
    const contract = productionPipeline.parseRequirementContract(
      "Build a polished website for a neighborhood café called Cedar & Steam. Design it for exactly three user groups: walk-in guests, takeout customers, and café staff. Include the menu, opening hours and location, plus a simple working way to place an order. Make it a real, usable site rather than a static mockup.",
    );

    expect(contract).toMatchObject({ template: "cafe-landing", projectName: "Cedar & Steam" });
    expect(contract.productSpec?.primaryUser).toContain("Walk-in guests");
    expect(contract.productSpec?.features.map(feature => feature.id)).toEqual([
      "cafe-menu", "cafe-order", "cafe-audiences", "cafe-location-hours",
    ]);
    expect(contract.featureContract?.features.every(feature => feature.requiredFiles.includes("src/data/cafe-menu.mjs"))).toBe(true);
    expect(contract.acceptanceCriteria.map(item => item.id)).toEqual([
      "responsive-viewport", "cafe-menu-order", "cafe-audience-groups", "cafe-location-hours",
      "project-identity-visible", "preview-response",
    ]);
  });

  it("recognizes Arabic café identity and generates 100-200 real artifacts", async () => {
    const request = "ابني موقع مقهى عربي متجاوب باسم مقهى الكيف الأصيل. أضف قائمة مشروبات وأسعارها، ساعات العمل والعنوان، وطلب استلام محلي مع تحقق ورسالة تأكيد. ابدأ البناء مباشرة، وأنشئ الملفات كاملة.";
    const contract = productionPipeline.parseRequirementContract(request);
    expect(contract).toMatchObject({ template: "cafe-landing", projectName: "مقهى الكيف الأصيل" });
    expect(contract.acceptanceCriteria.map(item => item.id)).toEqual(expect.arrayContaining([
      "cafe-menu-order",
      "cafe-location-hours",
      "project-identity-visible",
    ]));

    const run = await pipeline.createProjectFromRequest({
      userId: 703,
      projectId: 803,
      conversationId: 903,
      request,
      executionMode: "legacy-template",
    });
    completedRuns.push(run.id);
    if (!run.contract.productSpec || !run.manifest) throw new Error("Arabic café Build Run is missing its generated project contract.");
    const artifacts = createRequestSpecificArtifacts(run.contract.productSpec, run.manifest);
    expect(artifacts.length).toBeGreaterThanOrEqual(100);
    expect(artifacts.length).toBeLessThanOrEqual(200);
    expect(new Set(artifacts.map(artifact => artifact.path)).size).toBe(artifacts.length);
  });

  it("accepts a scoped reading-club edit as an actionable build request", () => {
    const request = "في موقع نادي القراءة، غيّر عنوان الكتاب The Quiet Atlas إلى The Glass Orchard في كل مكان يظهر فيه، وحافظ على البحث والتقدم وRSVP.";

    expect(() => productionPipeline.assertBuildRequestIsActionable(request)).not.toThrow();
    expect(productionPipeline.buildRequestNeedsPurposeClarification(request)).toBe(false);
    expect(productionPipeline.parseRequirementContract(request).productSpec?.features.map(feature => feature.id)).toContain("book-shelf");
  });

  it("renders a semantic contract-derived static identity without echoing the raw request, and fails an altered artifact", async () => {
    const record = persistenceRecorder();
    const request = "Create a concise product overview page for an appointment scheduling tool with a clear benefits section and responsive layout.";
    const run = await pipeline.createProjectFromRequest({ userId: 790, projectId: 890, conversationId: 990, buildId: "identity-regression-run", request, persistence: record.persistence });
    completedRuns.push(run.id);

    await pipeline.writeArtifactsToWorkspace(run, record.persistence);
    await pipeline.runPreviewProcess(run, record.persistence);
    const indexPath = path.join(run.workspaceRoot, "index.html");
    const index = await readFile(indexPath, "utf8");

    expect(index).toContain(`<meta name="smartbuild-project-identity" content="${run.contract.projectName}"`);
    expect(index).toContain('id="project-identity"');
    expect(index).not.toContain(request);

    const passing = await pipeline.runProjectTests(run, record.persistence);
    expect(passing.test?.results.find(result => result.criterionId === "project-identity-visible")).toMatchObject({ status: "PASS" });

    await writeFile(indexPath, `${index}\n<!-- ${request} -->`, "utf8");
    const failed = await pipeline.runProjectTests(run, record.persistence);
    expect(failed.test?.results.find(result => result.criterionId === "project-identity-visible")).toMatchObject({ status: "FAIL" });
  });

  it("does not select a SaaS or restaurant template from concepts the request explicitly rejects", () => {
    const contract = pipeline.parseRequirementContract("Build a responsive personal portfolio for Maya Noor. Do not create a SaaS landing page, dashboard, restaurant, or generic starter.");

    expect(contract.template).toBe("static-starter");
    expect(contract.projectName).toBe("Maya Noor Portfolio");
    expect(contract.acceptanceCriteria.map(item => item.id)).not.toContain("restaurant-landing-content");
  });

  it("requires clarification for an arbitrary Arabic message instead of deriving a static starter contract", () => {
    expect(() => pipeline.parseRequirementContract("بتعرف تنيل ايه")).toThrow("BUILD_REQUEST_CLARIFICATION_REQUIRED");
  });

  it.each(["ابني موقع", "Build me a website", "Create a responsive web page"])(
    "detects when a generic website request needs clarification: %s",
    request => {
      expect(productionPipeline.buildRequestNeedsPurposeClarification(request)).toBe(true);
    },
  );

  it.each([
    "Build a restaurant website",
    "Create a photographer portfolio",
    "ابني صفحة تسجيل دخول",
    "Build a concise product overview page for a scheduling tool",
    "Build a neighborhood plant giveaway marketplace",
    "Build a blog website about neighborhood walking trails",
    "ابني دليل لمسارات المشي في الحي",
    "ابني سوق تبادل نباتات للمجتمع المحلي",
  ])("accepts a website request with an identified purpose: %s", request => {
    expect(productionPipeline.buildRequestNeedsPurposeClarification(request)).toBe(false);
  });

  it("keeps trail-guide requirements specific instead of falling back to the generic workspace", () => {
    const contract = productionPipeline.parseRequirementContract(
      "Build a blog website about neighborhood walking trails. Add search, difficulty filters, route distance and details, and locally saved favorites. Frontend only.",
    );

    expect(contract.template).toBe("static-starter");
    expect(contract.projectName).toBe("Trail Atlas");
    expect(contract.productSpec?.features.map(feature => feature.id)).toContain("difficulty-filter");
    expect(contract.productSpec?.features.map(feature => feature.id)).toContain("saved-trails");
    expect(contract.acceptanceCriteria.map(item => item.id)).toContain("custom-difficulty-filter");
    expect(contract.acceptanceCriteria.map(item => item.capability)).not.toContain("backend-runtime");
  });

  it("accepts an Arabic request to write interface code as an actionable Build Run", () => {
    expect(pipeline.parseRequirementContract("عيد من الاول ابدا اكتب الاكواد بتاعت وجهه الدخو كده").template).toBe("static-starter");
  });

  it("does not turn explicitly excluded backend capabilities into required integrations", () => {
    const contract = pipeline.parseRequirementContract(
      "Build a neighborhood houseplant giveaway marketplace with filters and saved favorites. No backend, payments, or external services.",
    );

    expect(contract.template).toBe("static-starter");
    expect(contract.acceptanceCriteria.map(item => item.capability)).not.toContain("backend-runtime");
    expect(contract.acceptanceCriteria.map(item => item.capability)).not.toContain("database");
    expect(productionPipeline.buildRequestNeedsPurposeClarification(contract.request)).toBe(false);

    const arabicNegationContract = pipeline.parseRequirementContract(
      "Build a neighborhood houseplant exchange with fictional listings and pickup details. بدون backend أو مدفوعات أو خدمات خارجية.",
    );
    expect(arabicNegationContract.template).toBe("static-starter");

    const positiveBackendContract = pipeline.parseRequirementContract(
      "Build a local event coordination tool with an API backend and database persistence.",
    );
    expect(positiveBackendContract.template).toBe("capability-request");
  });

  it("builds a static request contract for a browser-only tool-lending app", () => {
    const contract = pipeline.parseRequirementContract(
      "Update the existing project from this complete request: Build a neighborhood tool-lending app where residents can browse tools, filter by availability, and request a loan. Use fictional sample listings and keep it frontend-only, with no backend or payments. Keep its existing functionality. Add this user-requested change: Add one new fictional available tool listing for a step ladder. Make it searchable and available through the filters.",
    );

    expect(contract.template).toBe("static-starter");
    expect(contract.projectName).toBe("Neighborhood Tool Share");
    expect(contract.classification?.category).toBe("custom");
    expect(contract.acceptanceCriteria.map(item => item.id)).toEqual([
      "responsive-viewport",
      "tool-listings-exist",
      "tool-filters-work",
      "loan-request-local",
      "requested-tool-addition",
      "project-identity-visible",
      "preview-response",
    ]);
    expect(contract.acceptanceCriteria.find(item => item.id === "requested-tool-addition")?.description).toContain("step ladder");
    expect(contract.acceptanceCriteria.map(item => item.capability)).not.toContain("backend-runtime");
  });

  it("keeps Arabic tool-library edits on the existing product contract", () => {
    const contract = pipeline.parseRequirementContract(
      "Update the existing project from this complete request: Build a neighborhood tool-lending app with searchable tools and local loan requests. Add this user-requested change: في مكتبة الأدوات اللي بنيتها، ضيف أداة جديدة باسم كشاف متاح للإعارة وخليه يظهر في البحث والفلاتر.",
    );

    expect(contract.template).toBe("static-starter");
    expect(contract.projectName).toBe("Neighborhood Tool Share");
    expect(contract.acceptanceCriteria.find(item => item.id === "requested-tool-addition")?.description).toContain("كشاف");
  });

  it("continues an explicitly legacy build through the legacy artifact path", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 791,
      projectId: 891,
      conversationId: 991,
      buildId: "explicit-legacy-execution-mode",
      request: "Build a concise product overview page for a scheduling tool.",
      persistence: record.persistence,
      executionMode: "legacy-template",
    });
    completedRuns.push(run.id);

    await pipeline.continueVerifiedBuild(run, record.persistence);

    expect(run.status).toBe("writing");
    expect(run.artifacts.map(artifact => artifact.path)).toEqual(expect.arrayContaining(["index.html", "styles.css", "README.md"]));
    expect(run.executionMode).toBe("legacy-template");
  });

  it("records only safe Build Run metadata and an incremental snapshot for every legacy artifact write", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 7911,
      projectId: 8911,
      conversationId: 9911,
      buildId: "legacy-artifact-write-events",
      request: "Build a concise product overview page for a scheduling tool.",
      persistence: record.persistence,
      executionMode: "legacy-template",
    });
    completedRuns.push(run.id);

    await pipeline.writeArtifactsToWorkspace(run, record.persistence);

    const writes = record.events.filter(event => event.eventType === "build.artifact.written");
    expect(writes.map(event => (event.payload as { path: string }).path)).toEqual(run.artifacts.map(artifact => artifact.path));
    expect(writes).toHaveLength(run.artifacts.length);
    for (const event of writes) {
      const payload = event.payload as Record<string, unknown>;
      expect(payload).toMatchObject({ buildId: run.id, path: expect.any(String), size: expect.any(Number), at: expect.any(String) });
      expect(Object.keys(payload).sort()).toEqual(["at", "buildId", "path", "size"]);
      expect(JSON.stringify(payload)).not.toContain("<!doctype html>");
    }
    expect(record.savedRuns.filter(saved => saved.id === run.id && saved.status === "planned").map(saved => saved.artifactCount)).toEqual([0, 1, 2, 3]);
  });

  it("blocks a restored nonterminal run whose durable execution mode is missing before any legacy artifact, preview, evaluator, or checkpoint action", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 792,
      projectId: 892,
      conversationId: 992,
      buildId: "missing-execution-mode-restored-run",
      request: "Build a concise product overview page for a scheduling tool.",
      persistence: record.persistence,
      executionMode: "production-agent-queue",
    });
    completedRuns.push(run.id);
    delete run.executionMode;

    const restored = pipeline.restoreBuildRun(run);
    await pipeline.continueVerifiedBuild(restored, record.persistence);

    expect(restored.status).toBe("blocked");
    expect(restored.error?.code).toBe("BUILD_EXECUTION_MODE_REQUIRED");
    expect(restored.artifacts).toHaveLength(0);
    expect(restored.generatedFileIds).toHaveLength(0);
    expect(restored.preview).toBeUndefined();
    expect(restored.test).toBeUndefined();
    expect(restored.checkpoint).toBeUndefined();
    expect(record.writtenArtifacts).toHaveLength(0);
    expect(record.projectUpdates).toHaveLength(0);
  });

  it("does not classify a Maya Noor portfolio as a restaurant when the request says no restaurant content", () => {
    const contract = pipeline.parseRequirementContract("Build a polished personal portfolio website for Maya Noor, a product designer. Include a hero, selected work, about section, contact call-to-action, responsive styling, and no restaurant content.");

    expect(contract.template).toBe("static-starter");
    expect(contract.projectName).toBe("Maya Noor Portfolio");
    expect(contract.acceptanceCriteria.map(item => item.id)).not.toContain("restaurant-landing-content");
    expect(contract.description).not.toContain("Bella Tavola");
  });

  it("keeps a portfolio with a contact form out of the contact-only template", () => {
    const contract = pipeline.parseRequirementContract("Build a responsive portfolio website for photographer Nour: Home, Gallery, About, and Contact; warm cream and deep green colors; working gallery filters and contact form validation; use local data only, no external services or real integrations.");
    const plan = pipeline.createBuildPlan(contract);

    expect(contract.template).toBe("static-starter");
    expect(contract.projectName).toBe("Nour Photography Portfolio");
    expect(contract.classification?.category).toBe("custom");
    expect(contract.acceptanceCriteria.map(item => item.id)).not.toContain("contact-form-exists");
    expect(contract.acceptanceCriteria.map(item => item.id)).toEqual(expect.arrayContaining([
      "portfolio-portfolio-gallery",
      "portfolio-gallery-filtering",
      "portfolio-contact-form-validation",
    ]));
    expect(contract.acceptanceCriteria.map(item => item.capability)).not.toContain("backend-runtime");
    expect(contract.acceptanceCriteria.map(item => item.capability)).not.toContain("database");
    expect(plan.steps.join(" ")).toContain("Home");
    expect(plan.steps.join(" ")).toContain("Gallery filters");
    expect(plan.steps.join(" ")).not.toContain("contact-form frontend");
  });

  it("keeps Maya Noor project identity when the request describes a personal site without repeating portfolio", () => {
    const contract = pipeline.parseRequirementContract("Build a polished personal website for Maya Noor, a product designer. Include a hero, selected work, about section, and contact call-to-action. Do not include restaurant or Bella Tavola content.");

    expect(contract).toMatchObject({ template: "static-starter", projectName: "Maya Noor Portfolio" });
    expect(contract.description).not.toContain("Bella Tavola");
  });

  it("does not classify a Maya Noor portfolio as a restaurant when the request says not a restaurant", () => {
    const contract = pipeline.parseRequirementContract("Build a polished personal portfolio website for Maya Noor, a UX designer. Include an editorial hero, selected case studies, an about section, contact call-to-action, responsive layout, and accessible navigation. Not a restaurant, not a food site, and not a SaaS product.");

    expect(contract.template).toBe("static-starter");
    expect(contract.projectName).toBe("Maya Noor Portfolio");
    expect(contract.acceptanceCriteria.map(item => item.id)).not.toContain("restaurant-landing-content");
    expect(contract.projectName).not.toContain("Bella");
  });

  it("keeps unrelated reservation capability details out of a Maya build plan", () => {
    const contract = pipeline.parseRequirementContract("Build a polished personal portfolio website for Maya Noor with an editorial hero, selected case studies, an about section, and contact call-to-action.");
    const plan = pipeline.createBuildPlan(contract);
    const serializedPlan = JSON.stringify(plan);

    expect(plan.capabilityMatrix.map(item => item.capability)).toEqual(["frontend"]);
    expect(serializedPlan).not.toMatch(/restaurant|reservation|bella/i);
  });

  it("keeps the full Bella Tavola contract for a generic restaurant website request", () => {
    const contract = pipeline.parseRequirementContract("Build a refined responsive restaurant website for Bella Tavola with a reservation form that will later connect to an external reservation service.");

    expect(contract).toMatchObject({ template: "restaurant-landing", projectName: "Bella Tavola" });
    expect(contract.acceptanceCriteria.map(item => item.id)).toEqual(expect.arrayContaining([
      "responsive-viewport",
      "restaurant-landing-content",
      "restaurant-menu-highlights",
      "restaurant-location-contact",
      "restaurant-accessible-structure",
      "restaurant-visual-identity",
      "restaurant-gallery-exists",
      "restaurant-map-placeholder",
      "reservation-form-exists",
      "reservation-client-validation-visible",
      "reservation-date-guard",
      "newsletter-signup-form",
      "newsletter-client-validation",
      "preview-response",
      "external-reservation-integration",
    ]));
  });

  it("runs a deterministic fixture through contract, files, preview, tests, evidence, and a verified checkpoint", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.runVerifiedBuild({ userId: 701, projectId: 801, conversationId: 901, request: "Create a concise product overview page for a scheduling tool", persistence: record.persistence });
    completedRuns.push(run.id);

    expect(run.status).toBe("succeeded");
    expect(run.contract.template).toBe("static-starter");
    expect(run.contract.acceptanceCriteria.length).toBeGreaterThan(2);
    expect(run.plan.steps).toHaveLength(5);
    expect(record.projectUpdates).toEqual([{ userId: 701, projectId: 801, name: run.contract.projectName, description: run.contract.description }]);
    expect(record.writtenArtifacts.map(file => file.path)).toEqual(["index.html", "styles.css", "README.md"]);
    expect(run.artifacts.map(file => file.path)).toEqual(["index.html", "styles.css", "README.md"]);
    expect(run.preview?.proxyUrl).toBe(`/api/build-runs/${run.id}/preview/`);
    expect(run.test?.passed).toBe(true);
    expect(run.evidence.map(item => item.path)).toEqual(expect.arrayContaining(["evidence/requirement-contract.json", "evidence/build-plan.json", "evidence/preview-check.json", "evidence/test-output.json", "evidence/evaluators/synthetic-evaluation.json", "evidence/build-summary.json", "evidence/checkpoint.json"]));
    expect(run.checkpoint?.type).toBe("checkpointed_git");
    expect(run.checkpoint?.revision).toMatch(/^[a-f0-9]{40}$/);
    expect(record.buildStatuses).toEqual(["planned", "writing", "previewing", "testing", "testing", "testing", "verifying", "succeeded"]);
    expect(run.syntheticEvaluation).toMatchObject({ enabled: true, execution_policy: "sequential", max_concurrency: 1, final_status: "PASS", checkpoint_allowed: true });
    expect(run.syntheticEvaluation?.runs.map(item => item.evaluator_instance)).toEqual(["functional_synthetic_user", "visual_synthetic_user"]);
    expect(record.events.filter(event => event.eventType === "build.status").length).toBeGreaterThanOrEqual(5);
    expect(record.savedRuns[0]).toMatchObject({ id: run.id, status: "planned", checkpoint: false });
    expect(record.savedRuns.map(snapshot => snapshot.status)).toEqual(expect.arrayContaining(["writing", "previewing", "testing", "verifying", "succeeded"]));
    expect(record.savedRuns.at(-1)).toMatchObject({ id: run.id, status: "succeeded", checkpoint: true });
    await expect(readFile(path.join(run.workspaceRoot, "evidence", "test-output.json"), "utf8")).resolves.toContain('"passed": true');
    await expect(readFile(path.join(run.workspaceRoot, "index.html"), "utf8")).resolves.toContain("SmartBuild verified starter");
  }, 30_000);

  it("keeps local development builds moving even when synthetic evaluation records a blocked checkpoint", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 701,
      projectId: 801,
      conversationId: 901,
      buildId: "synthetic-blocker-local-dev",
      request: "Create a concise product overview page for a scheduling tool",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    prepareCheckpointReleaseGate(run);
    run.syntheticEvaluation = {
      ...run.syntheticEvaluation!,
      checkpoint_allowed: false,
      final_status: "BLOCKED",
      bugs: [{
        bug_id: "bug-local-dev-block",
        evaluator_instance: "functional_synthetic_user",
        category: "functional",
        title: "Synthetic blocker fixture",
        severity: "high",
        confidence: 1,
        reproducible: true,
        steps_to_reproduce: ["open preview"],
        expected_result: "Page is valid.",
        actual_result: "Synthetic evaluator marked this page as blocked.",
        evidence_paths: ["evidence/evaluators/functional-findings.json"],
        console_errors: [],
        network_failures: [],
        screenshot_paths: [],
        status: "REPAIR_PLANNED",
      }],
      repair_tasks: [{
        task_id: "repair:bug-local-dev-block",
        task_graph_node_id: "taskgraph:repair:bug-local-dev-block",
        bug_id: "bug-local-dev-block",
        agent_id: "agent_005",
        agent_name: "Functional Component Engineer",
        depends_on: ["evaluator-evidence:bug-local-dev-block"],
        execution_policy: "sequential",
        resource_locks: ["project-write"],
        status: "REPAIR_PLANNED",
        reason: "Fixture only: local dev keeps the build moving while preserving evidence.",
      }],
    };
    await expect(productionPipeline.createVerifiedCheckpoint(run, record.persistence)).resolves.toMatchObject({ status: "verifying" });
    expect(run.checkpoint).toMatchObject({ type: "checkpointed_git" });
    expect(run.status).toBe("succeeded");
  });

  it("advances a production-agent Build one durable task at a time without template artifacts or preview before all tasks succeed", async () => {
    const record = persistenceRecorder();
    const taskRecords = [
      { taskId: "task-003", agentId: "agent_003", executionOrder: 1, status: "planned" as const, implementationHash: "a".repeat(64), outputArtifactRefs: [] as string[], evidenceRefs: [] as string[] },
      { taskId: "task-005", agentId: "agent_005", executionOrder: 2, status: "planned" as const, implementationHash: "b".repeat(64), outputArtifactRefs: [] as string[], evidenceRefs: [] as string[] },
    ];
    const summary = {
      registryCount: 300,
      executionMode: "dry-run" as const,
      checkpointAllowed: false,
      selectedAgents: [
        { id: "agent_003", name: "Intent Verifier Agent", team: "planning", role: "Confirms scope", modelProfile: "deep_reasoning", selected: true as const },
        { id: "agent_005", name: "Functional Component Engineer", team: "frontend", role: "Builds UI", modelProfile: "precise_coding", selected: true as const },
      ],
      skippedAgents: [],
      tasks: [
        { taskId: "task-003", agentId: "agent_003", title: "Clarify", dependsOn: [], locks: [], verificationMethods: ["structured-evidence"], selectedReason: "Matches build" },
        { taskId: "task-005", agentId: "agent_005", title: "Implement", dependsOn: ["task-003"], locks: ["project-write"], verificationMethods: ["agent-output-validation"], selectedReason: "Matches UI" },
      ],
      blockedReason: null,
    };
    let queuedModel: string | undefined;
    const queue = {
      seed: async () => taskRecords,
      list: async () => taskRecords,
      runOne: async (input: { model?: string }) => {
        queuedModel = input.model;
        const current = taskRecords.find(task => task.status === "planned");
        if (!current) return { state: "idle" as const };
        (current as { status: "succeeded" }).status = "succeeded";
        current.evidenceRefs.push(`evidence/agent-executions/${current.taskId}.json`);
        if (current.taskId === "task-005") {
          current.outputArtifactRefs.push("index.html", "styles.css", "README.md");
          record.writtenArtifacts.push(
            { userId: 711, buildRunId: "production-sequential-run", path: "index.html", content: "<!doctype html><title>Scoped build</title><main id=\"project-identity\">Scoped build</main>" },
            { userId: 711, buildRunId: "production-sequential-run", path: "styles.css", content: "body{margin:0}" },
            { userId: 711, buildRunId: "production-sequential-run", path: "README.md", content: "# Scoped build" },
          );
        }
        return { state: "succeeded" as const, taskId: current.taskId, agentId: current.agentId, artifactRefs: current.outputArtifactRefs, evidenceRefs: current.evidenceRefs };
      },
    };
    const persistence = { ...record.persistence, productionAgentQueue: queue };
    const run = await pipeline.createProjectFromRequest({ userId: 711, projectId: 811, conversationId: 911, buildId: "production-sequential-run", request: "Build a concise request-specific product page", persistence, executionMode: "production-agent-queue", model: AI_MODEL_IDS.claude });
    completedRuns.push(run.id);
    await mkdir(run.workspaceRoot, { recursive: true });
    await writeFile(path.join(run.workspaceRoot, "index.html"), "", "utf8");
    await writeFile(path.join(run.workspaceRoot, "styles.css"), "", "utf8");
    run.status = "writing";
    run.agentOrchestration = summary;

    await pipeline.continueVerifiedBuild(run, persistence);
    expect(run.status).toBe("writing");
    expect(run.preview).toBeUndefined();
    expect(run.productionAgentExecution?.tasks.filter(task => task.status === "succeeded")).toHaveLength(1);
    expect(queuedModel).toBe(AI_MODEL_IDS.claude);
    expect(record.writtenArtifacts).toHaveLength(0);

    await pipeline.continueVerifiedBuild(run, persistence);
    expect(run.status).toBe("writing");
    expect(run.preview).toBeUndefined();
    expect(run.productionAgentExecution?.tasks.every(task => task.status === "succeeded")).toBe(true);
    expect(run.artifacts.map(artifact => artifact.path)).toEqual(expect.arrayContaining(["index.html", "styles.css", "README.md"]));
    expect(run.evidence.map(item => item.path)).toEqual(expect.arrayContaining(["evidence/agent-executions/task-003.json", "evidence/agent-executions/task-005.json"]));

    await pipeline.continueVerifiedBuild(run, persistence);
    expect(run.preview).toBeDefined();
    expect(run.manifest?.files.find(file => file.path === "styles.css")).toMatchObject({ role: "style", usedInPreview: true });
    expect(run.manifest?.files.some(file => file.path === "styles/custom.css")).toBe(false);
    await expect(readFile(path.join(run.workspaceRoot, "index.html"), "utf8")).resolves.toContain("Scoped build");
    await expect(readFile(path.join(run.workspaceRoot, "styles.css"), "utf8")).resolves.toBe("body{margin:0}");
  });

  it("does not restore a workspace snapshot over its authoritative local files", async () => {
    const record = persistenceRecorder();
    const persistence = { ...record.persistence, workspaceArtifactsAreAuthoritative: true };
    const run = await pipeline.createProjectFromRequest({
      userId: 712,
      projectId: 812,
      conversationId: 912,
      buildId: "local-authoritative-run",
      request: "Build a small community feed for local readers",
      persistence,
      executionMode: "production-agent-queue",
    });
    completedRuns.push(run.id);
    await mkdir(run.workspaceRoot, { recursive: true });
    await writeFile(path.join(run.workspaceRoot, "index.html"), "<main>Current agent output</main>", "utf8");
    record.writtenArtifacts.push({
      userId: run.userId,
      buildRunId: run.id,
      path: "index.html",
      content: "",
    });

    await productionPipeline.restoreBuildWorkspace(run, persistence);

    await expect(readFile(path.join(run.workspaceRoot, "index.html"), "utf8")).resolves.toBe("<main>Current agent output</main>");
  });

  it("persists, restores, evidences, and exports an additive-agent artifact only for its selected production Build Run", async () => {
    const record = persistenceRecorder();
    const additiveArtifactPath = "agent-artifacts/pr-001/task-071.md";
    const additiveManifestPath = "agent-artifacts/pr-001/task-071.work-product.json";
    const additiveEvidencePath = "evidence/agent-executions/task-071.json";
    const taskRecords = [
      { taskId: "task-071", agentId: "agent_071", executionOrder: 1, status: "planned" as const, implementationHash: "7".repeat(64), outputArtifactRefs: [] as string[], evidenceRefs: [] as string[], logs: [] as string[] },
      { taskId: "task-093", agentId: "agent_093", executionOrder: 2, status: "planned" as const, implementationHash: "9".repeat(64), outputArtifactRefs: [] as string[], evidenceRefs: [] as string[], logs: [] as string[] },
    ];
    const summary = {
      registryCount: 300,
      executionMode: "dry-run" as const,
      checkpointAllowed: false,
      selectedAgents: [
        { id: "agent_071", name: "Product Request Analyst", team: "product", role: "Produces a request-scoped product brief", modelProfile: "deep_reasoning", selected: true as const },
        { id: "agent_093", name: "Component Generator", team: "frontend", role: "Produces bounded frontend files", modelProfile: "precise_coding", selected: true as const },
      ],
      skippedAgents: [],
      tasks: [
        { taskId: "task-071", agentId: "agent_071", title: "Produce product brief", dependsOn: [], locks: [], verificationMethods: ["structured-evidence"], selectedReason: "Product request analysis matches the submitted brief." },
        { taskId: "task-093", agentId: "agent_093", title: "Produce page files", dependsOn: ["task-071"], locks: ["project-write"], verificationMethods: ["agent-output-validation"], selectedReason: "Frontend implementation is needed after the scoped product brief." },
      ],
      blockedReason: null,
    };
    const queue = {
      seed: async () => taskRecords,
      list: async () => taskRecords,
      runOne: async () => {
        const current = taskRecords.find(task => task.status === "planned");
        if (!current) return { state: "idle" as const };
        (current as { status: "succeeded" }).status = "succeeded";
        if (current.taskId === "task-071") {
          current.outputArtifactRefs.push(additiveArtifactPath, additiveManifestPath);
          current.evidenceRefs.push(additiveEvidencePath);
          current.logs.push(
            "smartbuild-agent-execution-v1 artifacts=2 verification_passed=3 verification_blocked=1 additive_actions=4",
            "untrusted provider payload: smtp-password=must-not-be-returned",
          );
          record.writtenArtifacts.push(
            { userId: 714, buildRunId: "additive-agent-artifact-run", path: additiveArtifactPath, content: "# Product brief\n\nA portfolio for a product designer; not a restaurant." },
            { userId: 714, buildRunId: "additive-agent-artifact-run", path: additiveManifestPath, content: JSON.stringify({ actions: [{ type: "scope" }, { type: "research" }, { type: "verify" }, { type: "report" }] }) },
            { userId: 714, buildRunId: "additive-agent-artifact-run", path: additiveEvidencePath, content: JSON.stringify({ taskId: current.taskId, agentId: current.agentId, status: "succeeded", artifactPaths: [additiveArtifactPath] }) },
          );
        } else {
          current.outputArtifactRefs.push("index.html", "styles.css", "README.md");
          current.evidenceRefs.push("evidence/agent-executions/task-093.json");
          record.writtenArtifacts.push(
            { userId: 714, buildRunId: "additive-agent-artifact-run", path: "index.html", content: "<!doctype html><title>Additive evidence</title><main id=\"project-identity\">Additive evidence</main>" },
            { userId: 714, buildRunId: "additive-agent-artifact-run", path: "styles.css", content: "body{margin:0}" },
            { userId: 714, buildRunId: "additive-agent-artifact-run", path: "README.md", content: "# Additive evidence" },
            { userId: 714, buildRunId: "additive-agent-artifact-run", path: "evidence/agent-executions/task-093.json", content: JSON.stringify({ taskId: current.taskId, agentId: current.agentId, status: "succeeded" }) },
          );
        }
        return { state: "succeeded" as const, taskId: current.taskId, agentId: current.agentId, artifactRefs: current.outputArtifactRefs, evidenceRefs: current.evidenceRefs };
      },
    };
    const persistence = { ...record.persistence, productionAgentQueue: queue };
    const run = await pipeline.createProjectFromRequest({ userId: 714, projectId: 814, conversationId: 914, buildId: "additive-agent-artifact-run", request: "Build a request-specific portfolio for a product designer with case studies.", persistence, executionMode: "production-agent-queue" });
    completedRuns.push(run.id);
    run.status = "writing";
    run.agentOrchestration = summary;

    await pipeline.continueVerifiedBuild(run, persistence);
    await pipeline.continueVerifiedBuild(run, persistence);

    expect(run.artifacts.map(artifact => artifact.path)).toContain(additiveArtifactPath);
    expect(run.productionAgentExecution?.tasks.find(task => task.agentId === "agent_071")).toMatchObject({
      status: "succeeded",
      outputArtifactRefs: [additiveArtifactPath, additiveManifestPath],
      evidenceRefs: [additiveEvidencePath],
      executionSummary: { artifactCount: 2, verification: { passed: 3, blocked: 1 }, additiveActionCount: 4, pythonExecution: null },
    });
    expect(run.evidence.map(item => item.path)).toContain(additiveEvidencePath);
    expect(run.evidence.map(item => item.path)).toContain("evidence/agent-execution.json");

    const artifactWriteEvents = record.events.filter(event => event.eventType === "build.artifact.written");
    expect(artifactWriteEvents.map(event => (event.payload as { path: string }).path)).toEqual([
      additiveArtifactPath,
      additiveManifestPath,
      "index.html",
      "styles.css",
      "README.md",
    ]);
    for (const event of artifactWriteEvents) {
      const payload = event.payload as Record<string, unknown>;
      expect(payload).toMatchObject({ buildId: run.id, path: expect.any(String), size: expect.any(Number), at: expect.any(String) });
      expect(Object.keys(payload).sort()).toEqual(["at", "buildId", "path", "size"]);
      expect(JSON.stringify(payload)).not.toContain("Product brief");
      expect(JSON.stringify(payload)).not.toContain("smtp-password");
    }
    expect(record.savedRuns.filter(saved => saved.id === run.id && saved.status === "writing").map(saved => saved.artifactCount)).toEqual([2, 5]);

    const evidence = buildAgentExecutionEvidence({
      projectId: 814,
      conversationId: 914,
      buildRunId: run.id,
      plan: summary,
      productionTasks: await queue.list(),
    });
    const additiveAgent = evidence.agents.find(agent => agent.id === "agent_071");
    expect(additiveAgent?.artifactDetails).toEqual(expect.arrayContaining([
      { path: additiveArtifactPath, category: "ADDITIVE_REPORT" },
      { path: additiveManifestPath, category: "WORK_PRODUCT_MANIFEST" },
    ]));
    expect(additiveAgent?.executionSummary).toEqual({ artifactCount: 2, verification: { passed: 3, blocked: 1 }, additiveActionCount: 4, pythonExecution: null });
    expect(JSON.stringify(evidence)).not.toContain("smtp-password");

    record.writtenArtifacts.push({
      userId: 714,
      buildRunId: "foreign-build-run-id",
      path: "evidence/agent-execution.json",
      content: JSON.stringify({ projectId: 999, conversationId: 998, buildRunId: "foreign-build-run-id", agentId: "agent_300" }),
    });

    await rm(run.workspaceRoot, { recursive: true, force: true });
    await pipeline.restoreBuildWorkspace(run, persistence);
    await expect(readFile(path.join(run.workspaceRoot, additiveArtifactPath), "utf8")).resolves.toContain("Product brief");
    await expect(readFile(path.join(run.workspaceRoot, additiveManifestPath), "utf8")).resolves.toContain('"actions"');
    const exportedAgentEvidence = await readFile(path.join(run.workspaceRoot, "evidence", "agent-execution.json"), "utf8");
    expect(JSON.parse(exportedAgentEvidence)).toMatchObject({
      format: "smartbuild-agent-execution-evidence-v1",
      projectId: 814,
      conversationId: 914,
      buildRunId: run.id,
    });
    expect(exportedAgentEvidence).toContain('"agent_071"');
    expect(exportedAgentEvidence).toContain('"ADDITIVE_REPORT"');
    expect(exportedAgentEvidence).toContain('"artifactCount": 2');
    expect(exportedAgentEvidence).not.toContain("smtp-password");
    expect(exportedAgentEvidence).not.toContain("untrusted provider payload");
    expect(exportedAgentEvidence).not.toContain("foreign-build-run-id");

    const archive = await pipeline.exportBuildWorkspaceZip(run, persistence);
    const directory = archive.toString("utf8");
    expect(directory).not.toContain(`smartbuild-snapshot/${additiveArtifactPath}`);
    expect(directory).not.toContain(`smartbuild-snapshot/${additiveManifestPath}`);
    expect(directory).toContain(`"path": "${additiveArtifactPath}"`);
    expect(directory).toContain(`"path": "${additiveManifestPath}"`);
    expect(directory).toContain(`smartbuild-snapshot/${additiveEvidencePath}`);
    expect(directory).toContain("smartbuild-snapshot/evidence/agent-execution.json");
    expect(directory).toContain('"format": "smartbuild-agent-execution-evidence-v1"');
    expect(directory).toContain('"projectId": 814');
    expect(directory).toContain('"conversationId": 914');
    expect(directory).toContain(`"buildRunId": "${run.id}"`);
    expect(directory).not.toContain("smtp-password");
    expect(directory).not.toContain("foreign-build-run-id");
    expect(directory).not.toContain("foreign-additive-agent-artifact.md");
    expect(directory).not.toContain("# Product brief");
    expect(directory).toContain('"excludedPrivateAgentWorkProducts"');
  });

  it("persists, restores, evidences, and exports an original-agent work-product pair only for its selected production Build Run", async () => {
    const record = persistenceRecorder();
    const originalReportPath = "agent-artifacts/original/agent_003/task-003.md";
    const originalManifestPath = "agent-artifacts/original/agent_003/task-003.work-product.json";
    const originalEvidencePath = "evidence/agent-executions/task-003.json";
    const task = { taskId: "task-003", agentId: "agent_003", executionOrder: 1, status: "planned" as const, implementationHash: "3".repeat(64), outputArtifactRefs: [] as string[], evidenceRefs: [] as string[], logs: [] as string[] };
    const summary = {
      registryCount: 300,
      executionMode: "dry-run" as const,
      checkpointAllowed: false,
      selectedAgents: [{ id: "agent_003", name: "Intent Verifier Agent", team: "planning", role: "Confirms request scope", modelProfile: "deep_reasoning", selected: true as const }],
      skippedAgents: [],
      tasks: [{ taskId: "task-003", agentId: "agent_003", title: "Confirm request scope", dependsOn: [], locks: [], verificationMethods: ["structured-evidence"], selectedReason: "The selected original responsibility validates the submitted scope." }],
      blockedReason: null,
    };
    const queue = {
      seed: async () => [task],
      list: async () => [task],
      runOne: async () => {
        (task as { status: "succeeded" }).status = "succeeded";
        task.outputArtifactRefs.push(originalReportPath, originalManifestPath);
        task.evidenceRefs.push(originalEvidencePath);
        task.logs.push("smartbuild-agent-execution-v1 artifacts=2 verification_passed=1 verification_blocked=0 additive_actions=1");
        record.writtenArtifacts.push(
          { userId: 715, buildRunId: "original-agent-artifact-run", path: originalReportPath, content: "# Intent verification\n\nResponsibility-specific result retained privately." },
          { userId: 715, buildRunId: "original-agent-artifact-run", path: originalManifestPath, content: JSON.stringify({ agentKind: "original-canonical", canonicalAgentId: "agent_003", actions: [{ type: "responsibility-report", status: "completed" }], externalActions: "not-performed" }) },
          { userId: 715, buildRunId: "original-agent-artifact-run", path: originalEvidencePath, content: JSON.stringify({ taskId: task.taskId, agentId: task.agentId, status: "succeeded" }) },
        );
        return { state: "succeeded" as const, taskId: task.taskId, agentId: task.agentId, artifactRefs: task.outputArtifactRefs, evidenceRefs: task.evidenceRefs };
      },
    };
    const persistence = { ...record.persistence, productionAgentQueue: queue };
    const run = await pipeline.createProjectFromRequest({ userId: 715, projectId: 815, conversationId: 915, buildId: "original-agent-artifact-run", request: "Build a request-specific product portfolio with a clear purpose.", persistence, executionMode: "production-agent-queue" });
    completedRuns.push(run.id);
    run.status = "writing";
    run.agentOrchestration = summary;

    await pipeline.continueVerifiedBuild(run, persistence);

    expect(record.writtenArtifacts.filter(file => file.buildRunId === run.id).map(file => file.path)).toEqual(expect.arrayContaining([originalReportPath, originalManifestPath, originalEvidencePath]));
    expect(run.artifacts.map(artifact => artifact.path)).toEqual(expect.arrayContaining([originalReportPath, originalManifestPath]));
    expect(run.productionAgentExecution?.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ agentId: "agent_003", status: "succeeded", outputArtifactRefs: [originalReportPath, originalManifestPath], evidenceRefs: [originalEvidencePath] }),
    ]));
    expect(run.evidence.map(item => item.path)).toEqual(expect.arrayContaining([originalEvidencePath, "evidence/agent-execution.json"]));

    const evidence = buildAgentExecutionEvidence({ projectId: 815, conversationId: 915, buildRunId: run.id, plan: summary, productionTasks: await queue.list() });
    expect(evidence.agents.find(agent => agent.id === "agent_003")?.artifactDetails).toEqual([
      { path: originalReportPath, category: "ORIGINAL_REPORT" },
      { path: originalManifestPath, category: "WORK_PRODUCT_MANIFEST" },
    ]);
    expect(JSON.stringify(evidence)).not.toContain("Responsibility-specific result retained privately");

    record.writtenArtifacts.push({ userId: 715, buildRunId: "foreign-original-build-run", path: "agent-artifacts/original/agent_003/foreign-task.md", content: "foreign original report" });
    await rm(run.workspaceRoot, { recursive: true, force: true });
    await pipeline.restoreBuildWorkspace(run, persistence);
    await expect(readFile(path.join(run.workspaceRoot, originalReportPath), "utf8")).resolves.toContain("Intent verification");
    await expect(readFile(path.join(run.workspaceRoot, originalManifestPath), "utf8")).resolves.toContain('"agentKind"');

    const exportedAgentEvidence = await readFile(path.join(run.workspaceRoot, "evidence", "agent-execution.json"), "utf8");
    expect(exportedAgentEvidence).toContain('"ORIGINAL_REPORT"');
    expect(exportedAgentEvidence).toContain('"agent_003"');
    expect(exportedAgentEvidence).not.toContain("Responsibility-specific result retained privately");
    expect(exportedAgentEvidence).not.toContain("foreign-original-build-run");

    const archive = await pipeline.exportBuildWorkspaceZip(run, persistence);
    const directory = archive.toString("utf8");
    expect(directory).not.toContain(`smartbuild-snapshot/${originalReportPath}`);
    expect(directory).not.toContain(`smartbuild-snapshot/${originalManifestPath}`);
    expect(directory).toContain(`"path": "${originalReportPath}"`);
    expect(directory).toContain(`"path": "${originalManifestPath}"`);
    expect(directory).toContain(`smartbuild-snapshot/${originalEvidencePath}`);
    expect(directory).toContain('"ORIGINAL_REPORT"');
    expect(directory).not.toContain("Responsibility-specific result retained privately");
    expect(directory).not.toContain("foreign-original-build-run");
  });

  it("records a blocked production agent task as BLOCKED without attempting preview", async () => {
    const record = persistenceRecorder();
    const task = { taskId: "task-003", agentId: "agent_003", executionOrder: 1, status: "planned" as const, implementationHash: "c".repeat(64), outputArtifactRefs: [] as string[], evidenceRefs: [] as string[] };
    const summary = { registryCount: 300, executionMode: "dry-run" as const, checkpointAllowed: false, selectedAgents: [{ id: "agent_003", name: "Intent Verifier Agent", team: "planning", role: "Confirms scope", modelProfile: "deep_reasoning", selected: true as const }], skippedAgents: [], tasks: [{ taskId: "task-003", agentId: "agent_003", title: "Clarify", dependsOn: [], locks: [], verificationMethods: ["structured-evidence"], selectedReason: "Matches build" }], blockedReason: null };
    const queue = {
      seed: async () => [task],
      list: async () => [task],
      runOne: async () => {
        (task as { status: "blocked"; blockedReason?: string }).status = "blocked";
        (task as { blockedReason?: string }).blockedReason = "EXTERNAL_CAPABILITY_UNAVAILABLE";
        return { state: "blocked" as const, taskId: task.taskId, agentId: task.agentId, reason: "EXTERNAL_CAPABILITY_UNAVAILABLE" };
      },
    };
    const persistence = { ...record.persistence, productionAgentQueue: queue };
    const run = await pipeline.createProjectFromRequest({ userId: 712, projectId: 812, conversationId: 912, buildId: "production-blocked-run", request: "Build with a missing external capability", persistence, executionMode: "production-agent-queue" });
    completedRuns.push(run.id);
    run.status = "writing";
    run.agentOrchestration = summary;

    await pipeline.continueVerifiedBuild(run, persistence);
    expect(run.status).toBe("blocked");
    expect(run.preview).toBeUndefined();
    expect(run.error?.code).toBe("PRODUCTION_AGENT_TASK_BLOCKED");
  });

  it("records a model continuation timeout as timed out instead of a generic failed build", async () => {
    const record = persistenceRecorder();
    const task = { taskId: "task-005", agentId: "agent_005", executionOrder: 1, status: "planned" as const, implementationHash: "f".repeat(64), outputArtifactRefs: [] as string[], evidenceRefs: [] as string[], blockedReason: undefined as string | undefined };
    const summary = { registryCount: 300, executionMode: "dry-run" as const, checkpointAllowed: false, selectedAgents: [{ id: "agent_005", name: "Functional Component Engineer", team: "frontend", role: "Builds UI", modelProfile: "precise_coding", selected: true as const }], skippedAgents: [], tasks: [{ taskId: "task-005", agentId: "agent_005", title: "Implement", dependsOn: [], locks: [], verificationMethods: ["structured-evidence"], selectedReason: "Matches build" }], blockedReason: null };
    const queue = {
      seed: async () => [task],
      list: async () => [task],
      runOne: async () => {
        (task as { status: "failed" }).status = "failed";
        task.blockedReason = "AGENT_OUTPUT_CONTINUATION_TIMED_OUT";
        return { state: "failed" as const, taskId: task.taskId, agentId: task.agentId, code: "AGENT_OUTPUT_CONTINUATION_TIMED_OUT" };
      },
    };
    const persistence = { ...record.persistence, productionAgentQueue: queue };
    const run = await productionPipeline.createProjectFromRequest({
      userId: 712, projectId: 812, conversationId: 912, buildId: "production-agent-timeout-run",
      request: "Build a request-scoped page", persistence, executionMode: "production-agent-queue",
    });
    completedRuns.push(run.id);
    run.status = "writing";
    run.agentOrchestration = summary;

    await productionPipeline.continueVerifiedBuild(run, persistence);

    expect(run.status).toBe("timed_out");
    expect(run.error?.message).toContain("AGENT_OUTPUT_CONTINUATION_TIMED_OUT");
    expect(run.checkpoint).toBeUndefined();
  });

  it("blocks a production Build at verification when a succeeded task has no durable evidence", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 713,
      projectId: 813,
      conversationId: 913,
      buildId: "production-evidence-missing-run",
      request: "Build a request-scoped page with evidence",
      persistence: record.persistence,
      executionMode: "production-agent-queue",
    });
    completedRuns.push(run.id);
    run.status = "verifying";
    run.syntheticEvaluation = { enabled: true, execution_policy: "sequential", max_concurrency: 1, final_status: "PASS", checkpoint_allowed: true, runs: [] };
    run.productionAgentExecution = {
      mode: "production-agent-queue",
      plannedAt: Date.now(),
      tasks: [{ taskId: "task-005", agentId: "agent_005", executionOrder: 1, status: "succeeded", implementationHash: "d".repeat(64), outputArtifactRefs: ["index.html"], evidenceRefs: [] }],
    };
    run.agentOrchestration = {
      registryCount: 300,
      executionMode: "dry-run",
      checkpointAllowed: false,
      selectedAgents: [
        { id: "agent_005", name: "Functional Component Engineer", team: "frontend", role: "Builds UI", modelProfile: "precise_coding", selected: true },
      ],
      skippedAgents: [],
      tasks: [
        { taskId: "task-005", agentId: "agent_005", title: "Implement", dependsOn: [], locks: [], verificationMethods: ["agent-output-validation"], selectedReason: "REQUEST_CAPABILITY_MATCH" },
      ],
      blockedReason: null,
    };
    const persistence = {
      ...record.persistence,
      productionAgentQueue: {
        seed: async () => [],
        list: async () => [{
          taskId: "task-005",
          agentId: "agent_005",
          executionOrder: 1,
          status: "succeeded" as const,
          implementationHash: "d".repeat(64),
          outputArtifactRefs: ["index.html"],
          evidenceRefs: [] as string[],
          logs: ["smartbuild-agent-execution-v1 artifacts=1 verification_passed=1 verification_blocked=0 additive_actions=0"],
        }],
        runOne: async () => ({ state: "idle" as const }),
      },
    };

    await pipeline.continueVerifiedBuild(run, persistence);

    expect(run.status).toBe("blocked");
    expect(run.error?.code).toBe("PRODUCTION_AGENT_EVIDENCE_REQUIRED");
    expect(run.checkpoint).toBeUndefined();
  });

  it("rewinds a stale production verification phase when the durable agent queue is still incomplete", async () => {
    const record = persistenceRecorder();
    const run = await productionPipeline.createProjectFromRequest({
      userId: 713,
      projectId: 813,
      conversationId: 913,
      buildId: "production-queue-incomplete-at-verification",
      request: "Build a request-scoped page with evidence",
      persistence: record.persistence,
      executionMode: "production-agent-queue",
    });
    completedRuns.push(run.id);
    await productionPipeline.writeArtifactsToWorkspace(run, record.persistence);
    prepareCheckpointReleaseGate(run);
    const taskRecord = {
      taskId: "task-005",
      agentId: "agent_005",
      executionOrder: 1,
      status: "planned" as const,
      implementationHash: "5".repeat(64),
      outputArtifactRefs: [] as string[],
      evidenceRefs: [] as string[],
      logs: [] as string[],
    };
    run.executionMode = "production-agent-queue";
    run.agentOrchestration = {
      registryCount: 300,
      executionMode: "dry-run",
      checkpointAllowed: false,
      selectedAgents: [
        { id: "agent_005", name: "Functional Component Engineer", team: "frontend", role: "Builds UI", modelProfile: "precise_coding", selected: true },
      ],
      skippedAgents: [],
      tasks: [
        { taskId: "task-005", agentId: "agent_005", title: "Implement", dependsOn: [], locks: [], verificationMethods: ["agent-output-validation"], selectedReason: "REQUEST_CAPABILITY_MATCH" },
      ],
      blockedReason: null,
    };
    const persistence = {
      ...record.persistence,
      productionAgentQueue: {
        seed: async () => [taskRecord],
        list: async () => [taskRecord],
        runOne: async () => ({ state: "idle" as const }),
      },
    };

    await productionPipeline.continueVerifiedBuild(run, persistence);

    expect(run.status).toBe("writing");
    expect(run.error).toBeUndefined();
    expect(run.preview).toBeUndefined();
    expect(run.test).toBeUndefined();
    expect(run.syntheticEvaluation).toBeUndefined();
    expect(run.evidence.map(item => item.path)).not.toContain("evidence/test-output.json");
    expect(run.checkpoint).toBeUndefined();
  });

  it("exports every generated artifact plus durable evidence and checkpoint manifest after an ephemeral workspace is restored", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.runVerifiedBuild({ userId: 799, projectId: 899, conversationId: 999, request: "Build a responsive SaaS landing page", persistence: record.persistence });
    completedRuns.push(run.id);

    await rm(run.workspaceRoot, { recursive: true, force: true });
    const archive = await pipeline.exportBuildWorkspaceZip(run, record.persistence);
    const directory = archive.toString("utf8");

    for (const entry of [
      "index.html",
      "styles.css",
      "README.md",
      "evidence/requirement-contract.json",
      "evidence/build-plan.json",
      "evidence/preview-check.json",
      "evidence/test-output.json",
      "evidence/evaluators/synthetic-evaluation.json",
      "evidence/build-summary.json",
      "evidence/checkpoint.json",
      "evidence/build-run-export-manifest.json",
    ]) expect(directory).toContain(`smartbuild-snapshot/${entry}`);
  }, 30_000);

  it("rejects an unavailable Build Run export instead of producing an unscoped archive", async () => {
    await expect(pipeline.exportBuildWorkspaceZip("missing-release-gate-run")).rejects.toThrow("BUILD_RUN_UNAVAILABLE");
  });

  it("restores the durable Build Run workspace before snapshot checkpointing on a fresh Autoscale instance", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 795,
      projectId: 895,
      conversationId: 995,
      request: "Build a polished personal portfolio website for Maya Noor with responsive navigation and selected case studies.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    run.gitExecutable = null;
    await pipeline.writeArtifactsToWorkspace(run, record.persistence);
    prepareCheckpointReleaseGate(run);

    await rm(run.workspaceRoot, { recursive: true, force: true });
    await expect(pipeline.createVerifiedCheckpoint(run, record.persistence)).resolves.toMatchObject({ status: "succeeded", checkpoint: { type: "checkpointed_snapshot" } });

    await expect(readFile(path.join(run.workspaceRoot, "index.html"), "utf8")).resolves.toContain("Maya Noor");
    await expect(readFile(path.join(run.workspaceRoot, "evidence", "checkpoint.json"), "utf8")).resolves.toContain("checkpointed_snapshot");
  });

  it("fails closed when selected-run export preflight cannot find durable artifact bytes", async () => {
    const record = persistenceRecorder();
    const unavailableDurablePersistence = { ...record.persistence, listGeneratedFilesForBuildRun: async () => [] };
    const run = await pipeline.createProjectFromRequest({
      userId: 797,
      projectId: 897,
      conversationId: 997,
      request: "Build a polished personal portfolio website for Maya Noor with responsive navigation and selected case studies.",
      persistence: unavailableDurablePersistence,
    });
    completedRuns.push(run.id);
    run.gitExecutable = null;
    await pipeline.writeArtifactsToWorkspace(run, record.persistence);
    prepareCheckpointReleaseGate(run);
    await rm(run.workspaceRoot, { recursive: true, force: true });

    await expect(pipeline.createVerifiedCheckpoint(run, unavailableDurablePersistence)).rejects.toThrow("RELEASE_GATE_EXPORT_EVIDENCE_INVALID");
    expect(run.checkpoint).toBeUndefined();
    expect(run.status).toBe("verifying");
  });

  it("rejects direct production checkpointing without durable selected-task evidence", async () => {
    const record = persistenceRecorder();
    const run = await productionPipeline.createProjectFromRequest({
      userId: 796,
      projectId: 896,
      conversationId: 996,
      buildId: "release-gate-production-evidence-required",
      request: "Build a concise product overview page for a scheduling tool.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    await productionPipeline.writeArtifactsToWorkspace(run, record.persistence);
    prepareCheckpointReleaseGate(run);
    run.executionMode = "production-agent-queue";
    run.productionAgentExecution = { selectedTaskCount: 1, tasks: [], updatedAt: new Date().toISOString() };

    await expect(productionPipeline.createVerifiedCheckpoint(run, record.persistence)).rejects.toThrow("RELEASE_GATE_PRODUCTION_AGENT_EVIDENCE_INVALID");
    expect(run.status).toBe("verifying");
    expect(run.checkpoint).toBeUndefined();
  });

  it("accepts completed production evidence when a selected review agent has no source artifacts", async () => {
    const record = persistenceRecorder();
    const run = await productionPipeline.createProjectFromRequest({
      userId: 796,
      projectId: 896,
      conversationId: 996,
      buildId: "release-gate-production-review-only",
      request: "Build a concise product overview page for a scheduling tool.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    await productionPipeline.writeArtifactsToWorkspace(run, record.persistence);
    prepareCheckpointReleaseGate(run);
    const completedAt = new Date().toISOString();
    const executionSummary = {
      artifactCount: 0,
      verification: { passed: 1, blocked: 0 },
      additiveActionCount: 0,
      pythonExecution: null,
    };
    run.agentOrchestration = {
      ...run.agentOrchestration!,
      selectedAgents: [
        { id: "agent_003", name: "Intent Verifier Agent", team: "planning", role: "Confirms scope", modelProfile: "deep_reasoning", selected: true },
        { id: "agent_005", name: "Functional Component Engineer", team: "frontend", role: "Builds UI", modelProfile: "precise_coding", selected: true },
      ],
    };
    run.executionMode = "production-agent-queue";
    run.productionAgentExecution = {
      selectedTaskCount: 2,
      updatedAt: completedAt,
      tasks: [
        {
          taskId: "release-gate-production-review-only:agent_003",
          agentId: "agent_003",
          executionOrder: 1,
          status: "succeeded",
          implementationHash: "3".repeat(64),
          outputArtifactRefs: [],
          evidenceRefs: ["evidence/agent-executions/release-gate-production-review-only_agent_003.json"],
          startedAt: completedAt,
          completedAt,
          executionSummary,
        },
        {
          taskId: "release-gate-production-review-only:agent_005",
          agentId: "agent_005",
          executionOrder: 2,
          status: "succeeded",
          implementationHash: "5".repeat(64),
          outputArtifactRefs: ["index.html", "styles.css"],
          evidenceRefs: ["evidence/agent-executions/release-gate-production-review-only_agent_005.json"],
          startedAt: completedAt,
          completedAt,
          executionSummary: { ...executionSummary, artifactCount: 2 },
        },
      ],
    };
    for (const taskId of [
      "release-gate-production-review-only_agent_003",
      "release-gate-production-review-only_agent_005",
    ]) {
      run.evidence.push({
        path: `evidence/agent-executions/${taskId}.json`,
        kind: "agent-trace",
        createdAt: completedAt,
      });
    }
    run.gitExecutable = null;

    const completed = await productionPipeline.createVerifiedCheckpoint(run, record.persistence);

    expect(completed.status).toBe("succeeded");
    expect(completed.checkpoint).toBeDefined();
  });

  it("accepts release evidence for the single Website Builder Agent", async () => {
    const record = persistenceRecorder();
    const run = await productionPipeline.createProjectFromRequest({
      userId: 796,
      projectId: 896,
      conversationId: 996,
      buildId: "release-gate-website-builder",
      request: "Build a responsive clothing store with searchable products and a working cart.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    await productionPipeline.writeArtifactsToWorkspace(run, record.persistence);
    prepareCheckpointReleaseGate(run);
    const completedAt = new Date().toISOString();
    const taskId = `${run.id}:website-builder`;
    const evidencePath = agentExecutionEvidencePath(taskId);
    run.agentOrchestration = {
      ...run.agentOrchestration!,
      selectedAgents: [
        { id: WEBSITE_BUILDER_AGENT_ID, name: "Website Builder Agent", team: "website-building", role: "Implements the requested website", modelProfile: "deep_reasoning", selected: true },
      ],
    };
    run.executionMode = "production-agent-queue";
    run.productionAgentExecution = {
      selectedTaskCount: 1,
      updatedAt: completedAt,
      tasks: [{
        taskId,
        agentId: WEBSITE_BUILDER_AGENT_ID,
        executionOrder: 1,
        status: "succeeded",
        implementationHash: "b".repeat(64),
        outputArtifactRefs: ["index.html", "styles.css", "app.js"],
        evidenceRefs: [evidencePath],
        startedAt: completedAt,
        completedAt,
        executionSummary: {
          artifactCount: 3,
          verification: { passed: 3, blocked: 0 },
          additiveActionCount: 0,
          pythonExecution: null,
        },
      }],
    };
    run.evidence.push({ path: evidencePath, kind: "agent-trace", createdAt: completedAt });
    run.gitExecutable = null;

    const completed = await productionPipeline.createVerifiedCheckpoint(run, record.persistence);

    expect(completed.status).toBe("succeeded");
    expect(completed.checkpoint).toBeDefined();
  });

  it.each([
    ["duplicate task ID", { taskId: "task-001" }],
    ["duplicate agent ID", { agentId: "agent_001" }],
    ["non-contiguous execution order", { executionOrder: 3 }],
    ["mismatched durable evidence reference", { evidenceRefs: ["evidence/agent-executions/task-other.json"] }],
  ])("rejects a production checkpoint with %s", async (label, corruptSecondTask) => {
    const record = persistenceRecorder();
    const run = await productionPipeline.createProjectFromRequest({
      userId: 796,
      projectId: 896,
      conversationId: 996,
      buildId: `release-gate-production-corrupt-${label.replace(/[^a-z]+/gi, "-")}`,
      request: "Build a concise product overview page for a scheduling tool.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    await productionPipeline.writeArtifactsToWorkspace(run, record.persistence);
    prepareCheckpointReleaseGate(run);
    const completedAt = new Date().toISOString();
    const executionSummary = {
      artifactCount: 1,
      verification: { passed: 1, blocked: 0 },
      additiveActionCount: 1,
      pythonExecution: null,
    };
    const firstTask = {
      taskId: "task-001",
      agentId: "agent_001",
      executionOrder: 1,
      status: "succeeded" as const,
      implementationHash: "a".repeat(64),
      outputArtifactRefs: ["index.html"],
      evidenceRefs: ["evidence/agent-executions/task-001.json"],
      startedAt: completedAt,
      completedAt,
      executionSummary,
    };
    const secondTask = {
      taskId: "task-002",
      agentId: "agent_002",
      executionOrder: 2,
      status: "succeeded" as const,
      implementationHash: "b".repeat(64),
      outputArtifactRefs: ["styles.css"],
      evidenceRefs: ["evidence/agent-executions/task-002.json"],
      startedAt: completedAt,
      completedAt,
      executionSummary,
      ...corruptSecondTask,
    };
    for (const task of [firstTask, secondTask]) {
      const evidencePath = task.evidenceRefs[0];
      if (!run.evidence.some(item => item.path === evidencePath)) run.evidence.push({ path: evidencePath, kind: "agent-trace", createdAt: completedAt });
    }
    run.executionMode = "production-agent-queue";
    run.productionAgentExecution = { selectedTaskCount: 2, tasks: [firstTask, secondTask], updatedAt: completedAt };

    await expect(productionPipeline.createVerifiedCheckpoint(run, record.persistence)).rejects.toThrow("RELEASE_GATE_PRODUCTION_AGENT_EVIDENCE_INVALID");
    expect(run.status).toBe("verifying");
    expect(run.checkpoint).toBeUndefined();
  });

  it("rejects a direct checkpoint when either required evaluator has no passed interaction", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 797,
      projectId: 897,
      conversationId: 997,
      buildId: "release-gate-interaction-evidence-required",
      request: "Build a concise accessible portfolio landing page.",
      executionMode: "legacy-template",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    run.gitExecutable = null;
    await pipeline.writeArtifactsToWorkspace(run, record.persistence);
    prepareCheckpointReleaseGate(run);
    run.syntheticEvaluation!.runs[1].actions = [{ route: "/", step: "verify-responsive-interaction", passed: false }];

    await expect(pipeline.createVerifiedCheckpoint(run, record.persistence)).rejects.toThrow("RELEASE_GATE_EVALUATOR_EVIDENCE_INVALID");
    expect(run.status).toBe("verifying");
    expect(run.checkpoint).toBeUndefined();
  });

  it("rejects a checkpoint without an independent passing QA Agent report", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 797,
      projectId: 897,
      conversationId: 997,
      buildId: "release-gate-qa-agent-required",
      request: "Build a concise accessible portfolio landing page.",
      executionMode: "legacy-template",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    run.gitExecutable = null;
    await pipeline.writeArtifactsToWorkspace(run, record.persistence);
    prepareCheckpointReleaseGate(run);
    run.qaAgentReport = undefined;

    await expect(pipeline.createVerifiedCheckpoint(run, record.persistence)).rejects.toThrow("RELEASE_GATE_EVALUATOR_EVIDENCE_INVALID");
    expect(run.status).toBe("verifying");
    expect(run.checkpoint).toBeUndefined();
  });

  it("rejects a direct checkpoint with an unresolved high evaluator bug even when its summary falsely says PASS", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 798,
      projectId: 898,
      conversationId: 998,
      buildId: "release-gate-bug-classification-required",
      request: "Build a concise accessible portfolio landing page.",
      executionMode: "legacy-template",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    run.gitExecutable = null;
    await pipeline.writeArtifactsToWorkspace(run, record.persistence);
    prepareCheckpointReleaseGate(run);
    run.syntheticEvaluation!.bugs = [{
      bug_id: "bug-unresolved-high",
      evaluator_instance: "functional_synthetic_user",
      category: "navigation",
      title: "Required navigation action fails",
      severity: "high",
      confidence: 1,
      reproducible: true,
      steps_to_reproduce: ["Open the preview", "Select the required navigation link"],
      expected_result: "The requested section is reachable.",
      actual_result: "The required navigation action fails.",
      evidence_paths: ["evidence/evaluators/functional.json"],
      console_errors: [],
      network_failures: [],
      screenshot_paths: [],
      status: "NEW",
    }];
    run.evidence.push({ path: "evidence/evaluators/bug-reports.json", kind: "bug-report", createdAt: new Date().toISOString() });

    await expect(pipeline.createVerifiedCheckpoint(run, record.persistence)).rejects.toThrow("RELEASE_GATE_EVALUATOR_EVIDENCE_INVALID");
    expect(run.status).toBe("verifying");
    expect(run.checkpoint).toBeUndefined();
  });

  it("rejects a direct checkpoint with an unconfirmed critical evaluator bug", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 799,
      projectId: 899,
      conversationId: 999,
      buildId: "release-gate-unconfirmed-critical-bug",
      request: "Build a concise accessible portfolio landing page.",
      executionMode: "legacy-template",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    run.gitExecutable = null;
    await pipeline.writeArtifactsToWorkspace(run, record.persistence);
    prepareCheckpointReleaseGate(run);
    run.syntheticEvaluation!.bugs = [{
      bug_id: "bug-unconfirmed-critical",
      evaluator_instance: "visual_synthetic_user",
      category: "accessibility",
      title: "Critical visible accessibility defect requires confirmation",
      severity: "critical",
      confidence: 0.8,
      reproducible: false,
      steps_to_reproduce: ["Open the preview", "Inspect the primary interaction"],
      expected_result: "The required interaction remains accessible.",
      actual_result: "The evaluator could not confirm that the interaction is accessible.",
      evidence_paths: ["evidence/evaluators/visual.json"],
      console_errors: [],
      network_failures: [],
      screenshot_paths: [],
      status: "UNCONFIRMED",
    }];
    run.evidence.push({ path: "evidence/evaluators/bug-reports.json", kind: "bug-report", createdAt: new Date().toISOString() });

    await expect(pipeline.createVerifiedCheckpoint(run, record.persistence)).rejects.toThrow("RELEASE_GATE_EVALUATOR_EVIDENCE_INVALID");
    expect(run.status).toBe("verifying");
    expect(run.checkpoint).toBeUndefined();
  });

  it("recreates a reclaimed evidence directory before collecting the final build summary", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 794,
      projectId: 894,
      conversationId: 994,
      request: "Build a polished personal portfolio website for Maya Noor with selected case studies and a contact call-to-action.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    await pipeline.writeArtifactsToWorkspace(run, record.persistence);
    await rm(path.join(run.workspaceRoot, "evidence"), { recursive: true, force: true });

    await expect(pipeline.collectEvidence(run, record.persistence)).resolves.toMatchObject({ id: run.id });
    await expect(readFile(path.join(run.workspaceRoot, "evidence", "build-summary.json"), "utf8")).resolves.toContain(`"buildId": "${run.id}"`);
    expect(run.evidence.filter(item => item.path === "evidence/build-summary.json")).toHaveLength(1);
  });

  it("exports every durable file scoped to the selected nine-file Build Run and excludes another run's rows", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({ userId: 796, projectId: 896, conversationId: 996, buildId: "nine-file-maya-run", request: "Build a polished personal portfolio website for Maya Noor. Not a restaurant, not a food site, and not a SaaS product.", persistence: record.persistence });
    completedRuns.push(run.id);
    await pipeline.writeArtifactsToWorkspace(run, record.persistence);

    for (const [path, content] of [
      ["assets/case-study.txt", "Maya case study"],
      ["assets/profile.txt", "Maya profile"],
      ["docs/design-notes.md", "Maya design notes"],
      ["tests/portfolio.spec.ts", "Maya browser test"],
      ["scripts/validate.js", "Maya validation"],
      ["public/manifest.json", "Maya manifest"],
    ]) record.writtenArtifacts.push({ userId: run.userId, buildRunId: run.id, path, content });
    record.writtenArtifacts.push({ userId: run.userId, buildRunId: "foreign-bella-run", path: "assets/bella-menu.txt", content: "Bella Tavola must not export" });

    await rm(run.workspaceRoot, { recursive: true, force: true });
    const archive = await pipeline.exportBuildWorkspaceZip(run, record.persistence);
    const directory = archive.toString("utf8");
    const expectedPaths = [
      ...run.artifacts.map(artifact => artifact.path),
      ...run.evidence.filter(evidence => !evidence.path.endsWith(".zip")).map(evidence => evidence.path),
      "assets/case-study.txt",
      "assets/profile.txt",
      "docs/design-notes.md",
      "tests/portfolio.spec.ts",
      "scripts/validate.js",
      "public/manifest.json",
      "evidence/build-run-export-manifest.json",
    ].sort((left, right) => left.localeCompare(right));

    for (const entry of ["index.html", "styles.css", "README.md", "assets/case-study.txt", "assets/profile.txt", "docs/design-notes.md", "tests/portfolio.spec.ts", "scripts/validate.js", "public/manifest.json"]) {
      expect(directory).toContain(`smartbuild-snapshot/${entry}`);
    }
    const endOfDirectory = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(endOfDirectory).toBeGreaterThanOrEqual(0);
    const entryCount = archive.readUInt16LE(endOfDirectory + 10);
    let directoryOffset = archive.readUInt32LE(endOfDirectory + 16);
    const entryNames: string[] = [];
    for (let index = 0; index < entryCount; index += 1) {
      expect(archive.readUInt32LE(directoryOffset)).toBe(0x02014b50);
      const nameLength = archive.readUInt16LE(directoryOffset + 28);
      const extraLength = archive.readUInt16LE(directoryOffset + 30);
      const commentLength = archive.readUInt16LE(directoryOffset + 32);
      entryNames.push(archive.subarray(directoryOffset + 46, directoryOffset + 46 + nameLength).toString("utf8"));
      directoryOffset += 46 + nameLength + extraLength + commentLength;
    }
    expect(entryNames.sort((left, right) => left.localeCompare(right))).toEqual(expectedPaths.map(entry => `smartbuild-snapshot/${entry}`));
    expect(directory).toContain('"path": "tests/portfolio.spec.ts"');
    expect(directory).not.toContain("foreign-bella-run");
    expect(directory).not.toContain("Bella Tavola must not export");
  });

  it("exports only the selected Build Run when stale foreign trace and snapshot files exist in its workspace", async () => {
    const record = persistenceRecorder();
    const maya = await pipeline.createProjectFromRequest({ userId: 798, projectId: 898, conversationId: 998, buildId: "maya-zip-run", request: "Build a polished personal portfolio website for Maya Noor. Not a restaurant, not a food site, and not a SaaS product.", persistence: record.persistence });
    completedRuns.push(maya.id);
    await pipeline.writeArtifactsToWorkspace(maya, record.persistence);

    await mkdir(path.join(maya.workspaceRoot, "evidence", "agent-traces"), { recursive: true });
    await writeFile(path.join(maya.workspaceRoot, "evidence", "agent-traces", "bella-zip-run.jsonl"), JSON.stringify({ runId: "bella-zip-run", request: "Bella Tavola" }) + "\n", "utf8");
    await writeFile(path.join(maya.workspaceRoot, "evidence", "snapshot-foreign.zip"), Buffer.from("Bella Tavola evidence from bella-zip-run"));

    const archive = await pipeline.exportBuildWorkspaceZip(maya, record.persistence);
    const directory = archive.toString("utf8");

    expect(directory).toContain("smartbuild-snapshot/index.html");
    expect(directory).toContain("smartbuild-snapshot/evidence/build-run-export-manifest.json");
    expect(directory).toContain('"buildRunId": "maya-zip-run"');
    expect(directory).not.toContain("bella-zip-run");
    expect(directory).not.toContain("Bella Tavola");
    expect(directory).not.toContain("snapshot-foreign.zip");
  });

  it("persists a planned tracked Build Run before asynchronous artifact, preview, test, or evaluator work starts", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({ userId: 715, projectId: 815, conversationId: 915, request: "Build a responsive SaaS landing page", persistence: record.persistence });
    completedRuns.push(run.id);

    expect(run.status).toBe("planned");
    expect(record.savedRuns).toEqual([{ id: run.id, status: "planned", checkpoint: false, evidenceCount: 0, artifactCount: 0 }]);
    expect(record.writtenArtifacts).toEqual([]);
    expect(record.projectUpdates).toEqual([]);
    expect(record.buildStatuses).toEqual([]);
    expect(run.logs.at(-1)).toContain("tracked Build Run is ready for asynchronous execution");
  });

  it("restores durable artifacts before launching preview when an Autoscale worker lost its ephemeral workspace", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({ userId: 717, projectId: 817, conversationId: 917, request: "Build a polished personal portfolio website for Maya Noor. Not a restaurant, not a food site, not a SaaS product.", persistence: record.persistence });
    completedRuns.push(run.id);
    await pipeline.writeArtifactsToWorkspace(run, record.persistence);

    await rm(run.workspaceRoot, { recursive: true, force: true });
    await expect(readFile(path.join(run.workspaceRoot, "index.html"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    await pipeline.runPreviewProcess(run, record.persistence);

    await expect(readFile(path.join(run.workspaceRoot, "index.html"), "utf8")).resolves.toContain("Maya Noor");
    expect(run.preview?.assets).toEqual(expect.arrayContaining([expect.objectContaining({ path: "styles.css", status: 200, passed: true })]));
  }, 30_000);

  it("writes the current production manifest before the preview server applies its file allowlist", async () => {
    const record = persistenceRecorder();
    const run = await productionPipeline.createProjectFromRequest({
      userId: 717,
      projectId: 817,
      conversationId: 917,
      request: "Build a small reading club page.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    const artifacts = [
      { path: "index.html", language: "html" as const, content: '<!doctype html><html><head><link rel="stylesheet" href="styles.css"><script type="module" src="app.js"></script></head><body><main><h1>Reading Club</h1></main></body></html>' },
      { path: "styles.css", language: "css" as const, content: "main { color: green; }" },
      { path: "app.js", language: "javascript" as const, content: 'import { label } from "./src/data/club-data.mjs"; document.querySelector("h1").textContent = label;' },
      { path: "src/data/club-data.mjs", language: "javascript" as const, content: 'export const label = "Reading Club";' },
    ];
    for (const artifact of artifacts) {
      await record.persistence.addGeneratedFile(run.userId, run.projectId, run.conversationId, artifact, run.id);
    }

    await pipeline.runPreviewProcess(run, record.persistence);

    const manifest = JSON.parse(await readFile(path.join(run.workspaceRoot, "evidence", "project-manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ buildRunId: run.id, entryFile: "index.html" });
    expect(run.preview?.assets).toEqual(expect.arrayContaining([expect.objectContaining({ path: "styles.css", status: 200, passed: true })]));
    const script = await fetch(new URL("app.js", run.preview!.url));
    expect(script.status).toBe(200);
    expect(script.headers.get("x-smartbuild-build-run")).toBe(run.id);
    const module = await fetch(new URL("src/data/club-data.mjs", run.preview!.url));
    expect(module.status).toBe(200);
    expect(module.headers.get("content-type")).toContain("text/javascript");
  }, 30_000);

  it("persists the writing phase only after its complete artifact manifest is durable", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 719,
      projectId: 819,
      conversationId: 919,
      request: "Build a polished personal portfolio website for Maya Noor. Not a restaurant, not a food site, not a SaaS product.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);

    await pipeline.continueVerifiedBuild(run, record.persistence);

    const writingSnapshots = record.savedRuns.filter(snapshot => snapshot.status === "writing");
    expect(writingSnapshots.length).toBeGreaterThan(0);
    expect(writingSnapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ artifactCount: 3, evidenceCount: 2 }),
    ]));
    expect(writingSnapshots.every(snapshot => snapshot.artifactCount === 3 && snapshot.evidenceCount >= 2)).toBe(true);
    expect(run.artifacts.map(artifact => artifact.path)).toEqual(["index.html", "styles.css", "README.md"]);
  });

  it("turns a durable non-terminal run into an honest failed result after its background worker is interrupted", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({ userId: 716, projectId: 816, conversationId: 916, request: "Build a responsive SaaS landing page", persistence: record.persistence });
    completedRuns.push(run.id);
    await pipeline.updateProjectStatus(run, record.persistence, "testing", "Tests completed; synthetic evaluation was starting.");

    const recovered = await pipeline.recoverInterruptedBuildRun(run, record.persistence);

    expect(recovered.status).toBe("failed");
    expect(recovered.completedAt).toBeDefined();
    expect(recovered.error).toMatchObject({ code: "BUILD_WORKER_INTERRUPTED", step: "pipeline" });
    expect(recovered.logs.join("\n")).toContain("Existing artifacts and evidence were retained");
    expect(recovered.checkpoint).toBeUndefined();
    expect(record.buildStatuses).toEqual(expect.arrayContaining(["testing", "failed"]));
    expect(record.savedRuns.at(-1)).toMatchObject({ id: run.id, status: "failed", checkpoint: false });
  });

  it("persists a redacted terminal result when startup fails after a tracked Build Run was created", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({ userId: 716, projectId: 817, conversationId: 918, request: "Build a responsive SaaS landing page", persistence: record.persistence });
    completedRuns.push(run.id);

    const failed = await pipeline.recordBuildRunStartupFailure(run, record.persistence);

    expect(failed.status).toBe("failed");
    expect(failed.completedAt).toBeDefined();
    expect(failed.error).toMatchObject({ code: "BUILD_RUN_START_FAILED", step: "pipeline" });
    expect(failed.error?.message).not.toContain("/home/");
    expect(failed.error?.message).not.toContain("token");
    expect(failed.checkpoint).toBeUndefined();
    expect(record.buildStatuses).toEqual(expect.arrayContaining(["failed"]));
    expect(record.savedRuns.at(-1)).toMatchObject({ id: run.id, status: "failed", checkpoint: false });
  });

  it("recreates an expired preview before tests when a durable run resumes in previewing", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({ userId: 717, projectId: 817, conversationId: 917, request: "Build a responsive SaaS landing page", persistence: record.persistence });
    completedRuns.push(run.id);

    await pipeline.continueVerifiedBuild(run, record.persistence);
    await pipeline.continueVerifiedBuild(run, record.persistence);
    expect(run.status).toBe("previewing");
    expect(run.preview).toBeDefined();

    await pipeline.stopBuildPreview(run.id);
    run.preview = undefined;
    run.backend = undefined;

    await pipeline.continueVerifiedBuild(run, record.persistence);

    expect(run.status).toBe("testing");
    expect(run.preview).toBeDefined();
    expect(run.test?.results.find(result => result.criterionId === "preview-response")).toMatchObject({ status: "PASS" });
    expect(run.error).toBeUndefined();
    expect(run.logs.join("\n")).toContain("Preview process");
  }, 30_000);

  it("single-flights simultaneous Preview recovery requests for one Build Run", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 717,
      projectId: 819,
      conversationId: 919,
      buildId: "preview-single-flight",
      request: "Build a responsive personal portfolio website.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    await pipeline.writeArtifactsToWorkspace(run, record.persistence);

    const [first, second] = await Promise.all([
      pipeline.ensureBuildPreview(run, record.persistence),
      pipeline.ensureBuildPreview(run, record.persistence),
    ]);

    expect(first.preview?.buildRunId).toBe(run.id);
    expect(second.preview?.port).toBe(first.preview?.port);
    expect(first.preview?.assets.every(asset => asset.passed)).toBe(true);
  }, 30_000);

  it("recreates an expired preview before the visual synthetic evaluator begins", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({ userId: 717, projectId: 817, conversationId: 918, request: "Build a polished personal portfolio website for Maya Noor.", persistence: record.persistence });
    completedRuns.push(run.id);

    await pipeline.writeArtifactsToWorkspace(run, record.persistence);
    await pipeline.runPreviewProcess(run, record.persistence);
    await pipeline.runSyntheticEvaluators(run, record.persistence);
    expect(run.evaluatorProgress).toMatchObject({ state: "running", activeEvaluator: "visual_synthetic_user" });

    await pipeline.stopBuildPreview(run.id);
    await pipeline.runSyntheticEvaluators(run, record.persistence);

    expect(run.preview).toBeDefined();
    expect(run.syntheticEvaluation?.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ evaluator_instance: "functional_synthetic_user", status: "PASS" }),
      expect.objectContaining({ evaluator_instance: "visual_synthetic_user", status: "PASS" }),
    ]));
    expect(run.syntheticEvaluation?.bugs.some(item => item.title === "Synthetic browser evaluator could not start")).toBe(false);
  }, 30_000);

  it("rechecks both evaluator modes after a link repair and keeps unresolved visual defects blocked", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({ userId: 706, projectId: 806, conversationId: 906, request: "Create a concise product overview page for a scheduling tool", persistence: record.persistence });
    completedRuns.push(run.id);
    await pipeline.writeArtifactsToWorkspace(run, record.persistence);
    const indexPath = path.join(run.workspaceRoot, "index.html");
    await writeFile(indexPath, `${await readFile(indexPath, "utf8")}\n<a href=\"#\">Broken workflow link</a>`, "utf8");
    await pipeline.runPreviewProcess(run, record.persistence);
    for (let step = 0; step < 4; step += 1) {
      await pipeline.runSyntheticEvaluators(run, record.persistence);
      if (run.evaluatorProgress?.state !== "running") break;
    }

    expect(run.syntheticEvaluation).toMatchObject({ checkpoint_allowed: false, repair_cycles: 1 });
    expect(run.syntheticEvaluation?.bugs).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Required link has a fake href target", status: "FIXED" })]));
    expect(run.syntheticEvaluation?.repair_tasks).toEqual(expect.arrayContaining([expect.objectContaining({ status: "FIXED" })]));
    expect(run.syntheticEvaluation?.runs.filter(item => item.evaluator_instance === "visual_synthetic_user")).toHaveLength(2);
    expect(run.syntheticEvaluation?.runs.filter(item => item.evaluator_instance === "visual_synthetic_user").at(-1)?.status).not.toBe("PASS");
    expect(run.checkpoint).toBeUndefined();
    await expect(readFile(indexPath, "utf8")).resolves.toContain('href="#overview"');
    await expect(readFile(path.join(run.workspaceRoot, "evidence", "evaluators", "repair-history.json"), "utf8")).resolves.toContain('"cycle": 1');
  }, 30_000);

  it("creates real redacted BugReports, repairs, and a functional re-evaluation only for the explicit evaluator regression fixture", async () => {
    const record = persistenceRecorder();
    const previousEngine = process.env.SMARTBUILD_SYNTHETIC_EVALUATOR_ENGINE;
    process.env.SMARTBUILD_SYNTHETIC_EVALUATOR_ENGINE = "lightweight";
    try {
      const run = await pipeline.runVerifiedBuild({ userId: 718, projectId: 818, conversationId: 918, request: "Run the synthetic evaluator regression fixture for a responsive SaaS landing page", persistence: record.persistence });
      completedRuns.push(run.id);

      expect(run.contract.template).toBe("evaluator-regression-fixture");
      expect(run.status).toBe("blocked");
      expect(run.checkpoint).toBeUndefined();
      expect(run.syntheticEvaluation).toMatchObject({ checkpoint_allowed: false, repair_cycles: 1 });
      expect(run.syntheticEvaluation?.runs.map(item => item.evaluator_instance)).toEqual(["functional_synthetic_user", "visual_synthetic_user", "functional_synthetic_user"]);
      expect(run.syntheticEvaluation?.bugs).toEqual(expect.arrayContaining([
        expect.objectContaining({ title: "Required link has a fake href target", status: "FIXED" }),
        expect.objectContaining({ title: "Form shows success without a successful backend request", severity: "critical", status: "REPAIR_PLANNED" }),
        expect.objectContaining({ title: "Horizontal overflow at responsive viewport", severity: "high", status: "REPAIR_PLANNED" }),
      ]));
      expect(run.syntheticEvaluation?.repair_tasks).toEqual(expect.arrayContaining([expect.objectContaining({ task_id: expect.stringMatching(/^repair:bug-/), task_graph_node_id: expect.stringMatching(/^taskgraph:repair:bug-/), agent_id: expect.stringMatching(/^agent_\d{3}$/), resource_locks: ["project-write"] })]));
      await expect(readFile(path.join(run.workspaceRoot, "evidence", "evaluators", "bug-reports.json"), "utf8")).resolves.toContain("Form shows success without a successful backend request");
      await expect(readFile(path.join(run.workspaceRoot, "evidence", "evaluators", "repair-history.json"), "utf8")).resolves.toContain('"cycle": 1');
    } finally {
      if (previousEngine === undefined) delete process.env.SMARTBUILD_SYNTHETIC_EVALUATOR_ENGINE;
      else process.env.SMARTBUILD_SYNTHETIC_EVALUATOR_ENGINE = previousEngine;
    }
  }, 30_000);

  it("generates and verifies the responsive SaaS landing-page template instead of treating text as success", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.runVerifiedBuild({ userId: 702, projectId: 802, conversationId: 902, request: "Build a responsive SaaS landing page for an analytics product", persistence: record.persistence });
    completedRuns.push(run.id);

    expect(run.status).toBe("succeeded");
    expect(run.contract.template).toBe("saas-landing");
    expect(run.artifacts).toHaveLength(3);
    expect(run.test?.checks).toEqual(expect.arrayContaining(["PASS: Responsive viewport declaration exists", "PASS: Generated preview responds successfully"]));
    const html = await readFile(path.join(run.workspaceRoot, "index.html"), "utf8");
    expect(html).toContain("Launch a better SaaS experience.");
    expect(html).toContain('name="viewport"');
    expect(run.checkpoint).toBeDefined();
  }, 30_000);

  it("writes a real modular sign-in project to the selected workspace and persists every generated file", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 719,
      projectId: 819,
      conversationId: 919,
      request: "Build a polished sign-in page with email and password validation, remember me, forgot password, and a responsive accessible layout.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    await pipeline.continueVerifiedBuild(run, record.persistence);

    expect(run.status).toBe("writing");
    expect(run.contract.template).toBe("auth-flow");
    expect(run.artifacts.length).toBeGreaterThan(10);
    expect(run.artifacts.map(file => file.path)).toEqual(expect.arrayContaining([
      "index.html",
      "styles/auth.css",
      "src/auth.js",
      "data/auth.json",
      "project.manifest.json",
    ]));
    const workspacePaths = pipeline.listBuildWorkspaceFiles(run.id).map(file => file.path);
    expect(workspacePaths).toEqual(expect.arrayContaining(run.artifacts.map(file => file.path)));
    expect(record.writtenArtifacts.map(file => file.path)).toEqual(expect.arrayContaining(run.artifacts.map(file => file.path)));
    await expect(readFile(path.join(run.workspaceRoot, "src", "auth.js"), "utf8")).resolves.toContain("forgot-password");
    expect(run.artifacts.map(file => file.path)).not.toEqual(["index.html", "styles.css", "README.md"]);
  }, 30_000);

  it("builds a fresh author bookstore as a variable-sized storefront instead of reusing sign-in output", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 720,
      projectId: 820,
      conversationId: 920,
      request: "Build a new online book store for independent authors with a reading list and cart.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    await pipeline.continueVerifiedBuild(run, record.persistence);

    const html = await readFile(path.join(run.workspaceRoot, "index.html"), "utf8");
    const savedPaths = record.writtenArtifacts.filter(file => file.buildRunId === run.id).map(file => file.path);
    expect(run.status).toBe("writing");
    expect(run.contract.classification?.category).toBe("ecommerce");
    expect(html).toContain("library-header");
    expect(html).toContain("reading-list");
    expect(html).not.toContain("login-form");
    expect(run.artifacts.length).toBeGreaterThan(14);
    expect(new Set(run.artifacts.map(file => file.path)).size).toBe(run.artifacts.length);
    expect(savedPaths).toEqual(expect.arrayContaining(run.artifacts.map(file => file.path)));
    expect(savedPaths).toHaveLength(run.artifacts.length);
    expect(run.artifacts.map(file => file.path)).toContain("src/components/product/product-card.js");
    expect(run.artifacts.map(file => file.path)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^tests\/product\/.+\.test\.js$/),
    ]));
  }, 30_000);

  it("creates a deterministic verified snapshot when Git is unavailable instead of discarding a verified build", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.runVerifiedBuild({ userId: 703, projectId: 803, conversationId: 903, request: "Build a responsive SaaS landing page", persistence: record.persistence, gitExecutable: null });
    completedRuns.push(run.id);

    expect(run.status).toBe("succeeded");
    expect(run.checkpoint?.type).toBe("checkpointed_snapshot");
    expect(run.checkpoint?.revision).toMatch(/^snapshot-[a-f0-9]{64}$/);
    expect(run.checkpoint?.warning).toContain("Git is unavailable");
    expect(run.checkpoint?.archivePath).toMatch(/^evidence\/snapshot-[a-f0-9]{16}\.zip$/);
    await expect(readFile(path.join(run.workspaceRoot, run.checkpoint!.manifestPath!), "utf8")).resolves.toContain('"sha256"');
    expect((await readFile(path.join(run.workspaceRoot, run.checkpoint!.archivePath!))).byteLength).toBeGreaterThan(100);
    expect(run.logs.join("\n")).toContain('"executable":null');
  }, 30_000);

  it("serves local styles.css from the preview root with CSS content type and non-empty content", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.runVerifiedBuild({ userId: 704, projectId: 804, conversationId: 904, request: "Build a responsive SaaS landing page", persistence: record.persistence });
    completedRuns.push(run.id);

    const stylesheet = await pipeline.readBuildPreview(run.id, "styles.css");
    expect(stylesheet.contentType).toContain("text/css");
    expect(stylesheet.body.byteLength).toBeGreaterThan(40);
    expect(stylesheet.body.toString("utf8")).toContain(".hero");
    expect(run.preview?.assets).toEqual(expect.arrayContaining([expect.objectContaining({ path: "styles.css", status: 200, passed: true })]));
  }, 30_000);

  it("verifies the exact contact-form request through the preview proxy, FastAPI validation, project SQLite persistence, and an executable browser test", async () => {
    const record = persistenceRecorder();
    const request = "Build a contact page with a real form. Validate name, email, and message fields, show real validation errors, submit to a backend endpoint, save the submission in the project database, and create Playwright tests. Do not use mock data or fake success messages. If the database or email provider is missing, mark that part BLOCKED and explain exactly what is missing.";
    const run = await pipeline.runVerifiedBuild({ userId: 705, projectId: 805, conversationId: 905, request, persistence: record.persistence });
    completedRuns.push(run.id);

    expect(run.status).toBe("succeeded");
    expect(run.contract.template).toBe("contact-form");
    expect(run.agentOrchestration).toMatchObject({ registryCount: 300, executionMode: "dry-run", checkpointAllowed: true });
    expect(run.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ path: "evidence/agent-plan.json", kind: "agent-plan" })]));
    await expect(readFile(path.join(run.workspaceRoot, "evidence", "agent-plan.json"), "utf8")).resolves.toContain('"registryCount": 300');
    expect(run.syntheticEvaluation).toMatchObject({ final_status: "PASS", checkpoint_allowed: true, repair_cycles: 0 });
    expect(run.syntheticEvaluation?.runs.map(item => item.evaluator_instance)).toEqual(["functional_synthetic_user", "visual_synthetic_user"]);
    await expect(readFile(path.join(run.workspaceRoot, "evidence", "evaluators", "synthetic-evaluation.json"), "utf8")).resolves.toContain('"functional_synthetic_user"');
    expect(run.artifacts.map(file => file.path)).toEqual(["index.html", "styles.css", "backend/smartbuild.routes.json", "backend/migrations/001-contact-submissions.sql", "playwright/contact-form.spec.js", "README.md"]);
    expect(run.artifacts.map(file => file.path)).not.toEqual(["index.html", "styles.css", "README.md"]);
    expect(run.checkpoint).toBeDefined();
    expect(run.test?.results).toHaveLength(6);
    expect(run.test?.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ criterionId: "contact-form-exists", status: "PASS" }),
      expect.objectContaining({ criterionId: "contact-fields-exist", status: "PASS" }),
      expect.objectContaining({ criterionId: "client-validation-visible", status: "PASS" }),
      expect.objectContaining({ criterionId: "backend-post-endpoint", status: "PASS" }),
      expect.objectContaining({ criterionId: "database-schema-persistence", status: "PASS" }),
      expect.objectContaining({ criterionId: "playwright-tests", status: "PASS" }),
    ]));
    expect(run.error).toBeUndefined();
    expect(record.buildStatuses).toContain("succeeded");
    expect(run.backend).toEqual(expect.objectContaining({ kind: "fastapi", database: "sqlite" }));
    const pythonRuntimeDiagnostic = JSON.parse(await readFile(path.join(run.workspaceRoot, "evidence", "python-runtime-project-runtime.json"), "utf8"));
    expect(pythonRuntimeDiagnostic).toMatchObject({ component: "project-runtime", status: "ready", requiredModules: expect.arrayContaining(["pydantic", "fastapi", "uvicorn"]) });
    expect(await fetch(new URL("api/contact", run.preview!.url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "A", email: "invalid", message: "" }) })).toEqual(expect.objectContaining({ status: 422 }));
    expect(await fetch(new URL("api/__test__/contact-submissions", run.preview!.url))).toEqual(expect.objectContaining({ status: 404 }));
    await expect(readFile(path.join(run.workspaceRoot, ".smartbuild-runtime", "project.sqlite3"))).resolves.toBeInstanceOf(Buffer);
    const report = JSON.parse(await readFile(path.join(run.workspaceRoot, "evidence", "test-output.json"), "utf8"));
    expect(report.criteria).toHaveLength(6);
    expect(report.criteria.every((result: { criterionId: string; status: string }) => result.status === "PASS")).toBe(true);
  }, 45_000);

  it("falls back from an unavailable configured Python path to a validated runtime for FastAPI", async () => {
    const previousPython = process.env.SMARTBUILD_PYTHON_EXECUTABLE;
    process.env.SMARTBUILD_PYTHON_EXECUTABLE = "/definitely-not-a-smartbuild-python";
    try {
      const record = persistenceRecorder();
      const run = await pipeline.createProjectFromRequest({ userId: 711, projectId: 811, conversationId: 911, request: "Build a contact form with a backend POST endpoint and database persistence.", persistence: record.persistence });
      completedRuns.push(run.id);
      await pipeline.writeArtifactsToWorkspace(run, record.persistence);

      await pipeline.runPreviewProcess(run, record.persistence);

      const diagnostic = JSON.parse(await readFile(path.join(run.workspaceRoot, "evidence", "python-runtime-project-runtime.json"), "utf8"));
      expect(diagnostic).toMatchObject({ component: "project-runtime", status: "ready", requiredModules: expect.arrayContaining(["pydantic", "fastapi", "uvicorn"]) });
      expect(diagnostic.attempts).toEqual(expect.arrayContaining([{ candidate: "configured-runtime", result: "not_executable" }]));
      expect(run.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ path: "evidence/python-runtime-project-runtime.json" })]));
      expect(run.backend).toEqual(expect.objectContaining({ kind: "fastapi", database: "sqlite" }));
      expect(run.test).toBeUndefined();
      expect(run.syntheticEvaluation).toBeUndefined();
      expect(run.checkpoint).toBeUndefined();
    } finally {
      if (previousPython === undefined) delete process.env.SMARTBUILD_PYTHON_EXECUTABLE;
      else process.env.SMARTBUILD_PYTHON_EXECUTABLE = previousPython;
    }
  }, 30_000);

  it("marks a missing project backend or SQLite capability blocked and refuses a checkpoint", async () => {
    const record = persistenceRecorder();
    const capabilities = pipeline.detectWorkspaceCapabilities();
    capabilities["backend-runtime"] = { available: false, detail: "Regression fixture: FastAPI runtime unavailable." };
    capabilities.database = { available: false, detail: "Regression fixture: project SQLite unavailable." };
    const run = await pipeline.runVerifiedBuild({ userId: 707, projectId: 807, conversationId: 907, request: "Build a contact form with a backend POST endpoint and database persistence.", persistence: record.persistence, capabilities });
    completedRuns.push(run.id);

    expect(run.status).toBe("blocked");
    expect(run.checkpoint).toBeUndefined();
    expect(run.error?.code).toBe("PROJECT_RUNTIME_UNAVAILABLE");
    expect(record.buildStatuses).not.toContain("succeeded");
  }, 30_000);

  it("blocks only the requested email-provider criterion when FastAPI, SQLite, and browser checks pass", async () => {
    const record = persistenceRecorder();
    const request = "Build a contact page with a real form, backend POST endpoint, SQLite persistence, Playwright tests, and send an email confirmation after each submission.";
    const run = await pipeline.runVerifiedBuild({ userId: 708, projectId: 808, conversationId: 908, request, persistence: record.persistence, gitExecutable: null });
    completedRuns.push(run.id);

    expect(run.status).toBe("blocked");
    expect(run.checkpoint).toBeUndefined();
    expect(run.test?.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ criterionId: "backend-post-endpoint", status: "PASS" }),
      expect.objectContaining({ criterionId: "database-schema-persistence", status: "PASS" }),
      expect.objectContaining({ criterionId: "playwright-tests", status: "PASS" }),
      expect.objectContaining({ criterionId: "email-provider", status: "BLOCKED", reason: expect.stringContaining("No email delivery provider") }),
    ]));
    expect(run.test?.results.filter(result => result.status === "BLOCKED").map(result => result.criterionId)).toEqual(["email-provider"]);
  }, 45_000);

  it("uses separate project-scoped SQLite files for different generated projects", async () => {
    const first = persistenceRecorder();
    const second = persistenceRecorder();
    const request = "Build a contact page with a real form, backend POST endpoint, database persistence, and Playwright tests.";
    const one = await pipeline.runVerifiedBuild({ userId: 709, projectId: 809, conversationId: 909, request, persistence: first.persistence, gitExecutable: null });
    const two = await pipeline.runVerifiedBuild({ userId: 710, projectId: 810, conversationId: 910, request, persistence: second.persistence, gitExecutable: null });
    completedRuns.push(one.id, two.id);

    expect(one.status).toBe("succeeded");
    expect(two.status).toBe("succeeded");
    const firstDatabase = path.join(path.dirname(one.workspaceRoot), ".smartbuild-runtime", "project.sqlite3");
    const secondDatabase = path.join(path.dirname(two.workspaceRoot), ".smartbuild-runtime", "project.sqlite3");
    expect(firstDatabase).not.toBe(secondDatabase);
    const nextVersionRoot = productionPipeline.buildWorkspacePath(one.userId, one.projectId, "next-version");
    const nextVersionDatabase = path.join(path.dirname(nextVersionRoot), ".smartbuild-runtime", "project.sqlite3");
    expect(nextVersionDatabase).toBe(firstDatabase);
    await expect(readFile(firstDatabase)).resolves.toBeInstanceOf(Buffer);
    await expect(readFile(secondDatabase)).resolves.toBeInstanceOf(Buffer);
  }, 60_000);

  it("cannot checkpoint a backend-required contract when only static artifacts exist and a required capability is blocked", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({ userId: 706, projectId: 806, conversationId: 906, request: "Build a contact form with a backend POST endpoint and database persistence.", persistence: record.persistence });
    run.artifacts.push({ path: "index.html", size: 10 }, { path: "styles.css", size: 10 }, { path: "README.md", size: 10 });
    run.preview = { url: "http://127.0.0.1:1/", proxyUrl: "/preview/", port: 1, checkedAt: new Date().toISOString(), assets: [] };
    run.evidence.push({ path: "evidence/test-output.json", kind: "test", createdAt: new Date().toISOString() });
    run.test = {
      passed: false,
      checks: ["PASS: Contact form exists", "BLOCKED: Backend POST endpoint exists", "BLOCKED: Database schema and persistence exist"],
      outputPath: "evidence/test-output.json",
      checkedAt: new Date().toISOString(),
      results: run.contract.acceptanceCriteria.map(criterion => ({
        criterionId: criterion.id,
        criterion: criterion.title,
        capability: criterion.capability,
        status: criterion.capability === "backend-runtime" || criterion.capability === "database" ? "BLOCKED" as const : "PASS" as const,
        evidence: "Static-only regression fixture.",
        ...(criterion.capability === "backend-runtime" || criterion.capability === "database" ? { reason: "Static artifacts cannot provide this required runtime capability." } : {}),
      })),
    };

    await expect(pipeline.createVerifiedCheckpoint(run, record.persistence)).rejects.toThrow("ACCEPTANCE_CRITERIA_BLOCKED");
    expect(run.status).toBe("planned");
    expect(run.checkpoint).toBeUndefined();
    expect(record.buildStatuses).not.toContain("succeeded");
  });

  it("builds the feasible Bella Tavola restaurant UI and records only its unavailable external reservation integration as blocked", async () => {
    const record = persistenceRecorder();
    const request = "Build a refined responsive restaurant landing page for Bella Tavola with menu highlights, reservation form, location and contact details. If an external reservations backend is not available, build the working frontend and mark only that integration BLOCKED with the exact reason.";
    const run = await pipeline.runVerifiedBuild({ userId: 719, projectId: 819, conversationId: 919, request, persistence: record.persistence, gitExecutable: null });
    completedRuns.push(run.id);

    expect(run.contract).toMatchObject({ projectName: "Bella Tavola", template: "restaurant-landing" });
    expect(run.status).toBe("blocked");
    expect(run.checkpoint).toBeUndefined();
    expect(run.artifacts.map(item => item.path)).toEqual(expect.arrayContaining(["index.html", "styles.css", "README.md", "project.manifest.json"]));
    expect(run.artifacts.length).toBeGreaterThanOrEqual(100);
    expect(run.artifacts.length).toBeLessThanOrEqual(200);
    expect(run.test?.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ criterionId: "restaurant-landing-content", status: "PASS" }),
      expect.objectContaining({ criterionId: "restaurant-menu-highlights", status: "PASS" }),
      expect.objectContaining({ criterionId: "restaurant-location-contact", status: "PASS" }),
      expect.objectContaining({ criterionId: "restaurant-accessible-structure", status: "PASS" }),
      expect.objectContaining({ criterionId: "restaurant-visual-identity", status: "PASS" }),
      expect.objectContaining({ criterionId: "restaurant-gallery-exists", status: "PASS" }),
      expect.objectContaining({ criterionId: "restaurant-map-placeholder", status: "PASS" }),
      expect.objectContaining({ criterionId: "reservation-form-exists", status: "PASS" }),
      expect.objectContaining({ criterionId: "reservation-client-validation-visible", status: "PASS" }),
      expect.objectContaining({ criterionId: "reservation-date-guard", status: "PASS" }),
      expect.objectContaining({ criterionId: "newsletter-signup-form", status: "PASS" }),
      expect.objectContaining({ criterionId: "newsletter-client-validation", status: "PASS" }),
      expect.objectContaining({ criterionId: "external-reservation-integration", status: "BLOCKED", reason: expect.stringContaining("No configured external reservation backend") }),
    ]));
    const html = await readFile(path.join(run.workspaceRoot, "index.html"), "utf8");
    expect(html).toContain("Your request is ready, but it has not been sent");
    expect(html).not.toContain("Reservation confirmed");
    expect(html).toContain('id="gallery"');
    expect(html).toContain("Map location placeholder for Bella Tavola");
    expect(html).toContain("Reservation date must be today or later.");
    expect(html).toContain("Enter a valid email address.");
    expect(html.match(/id="top"/g)).toHaveLength(1);
    expect(html).toContain("min-height:28px");
  }, 30_000);

  it("keeps a static portfolio request independent of unavailable backend integrations", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.runVerifiedBuild({ userId: 720, projectId: 820, conversationId: 920, request: "Create a responsive personal portfolio for a product designer with selected work and contact details.", persistence: record.persistence, gitExecutable: null });
    completedRuns.push(run.id);

    expect(run.status).toBe("succeeded");
    expect(run.contract.template).toBe("static-starter");
    expect(run.test?.results.every(result => result.status === "PASS")).toBe(true);
    expect(run.checkpoint?.type).toBe("checkpointed_snapshot");
  }, 30_000);

  it("does not echo a raw exclusion for Bella Tavola into a Maya static preview", async () => {
    const record = persistenceRecorder();
    const request = "Build a polished personal portfolio website for Maya Noor, a UX designer. Do not include Bella Tavola, restaurant, food, dining, menu, or reservation content.";
    const run = await pipeline.runVerifiedBuild({ userId: 726, projectId: 826, conversationId: 926, request, persistence: record.persistence, gitExecutable: null });
    completedRuns.push(run.id);

    const html = await readFile(path.join(run.workspaceRoot, "index.html"), "utf8");
    expect(run.status).toBe("succeeded");
    expect(run.contract.acceptanceCriteria).toEqual(expect.arrayContaining([expect.objectContaining({ id: "project-identity-visible" })]));
    expect(run.test?.results).toEqual(expect.arrayContaining([expect.objectContaining({ criterionId: "project-identity-visible", status: "PASS" })]));
    expect(html).toContain("Maya Noor");
    expect(html).not.toContain("Bella Tavola");
    expect(html).not.toContain("restaurant");
  }, 30_000);

  it("does not persist a Maya exclusion phrase in Bella artifacts or durable evidence", async () => {
    const record = persistenceRecorder();
    const request = "Build a refined Bella Tavola restaurant landing page with menu highlights, reservations, location, and a gallery. Do not include any Maya Noor, portfolio, designer, or SaaS content.";
    const run = await pipeline.runVerifiedBuild({ userId: 727, projectId: 827, conversationId: 927, request, persistence: record.persistence, gitExecutable: null });
    completedRuns.push(run.id);

    const [readme, requirementEvidence, planEvidence, summaryEvidence] = await Promise.all([
      readFile(path.join(run.workspaceRoot, "README.md"), "utf8"),
      readFile(path.join(run.workspaceRoot, "evidence", "requirement-contract.json"), "utf8"),
      readFile(path.join(run.workspaceRoot, "evidence", "build-plan.json"), "utf8"),
      readFile(path.join(run.workspaceRoot, "evidence", "build-summary.json"), "utf8"),
    ]);

    expect(run.contract).toMatchObject({ projectName: "Bella Tavola", template: "restaurant-landing" });
    expect(run.contract.request).toContain("scoped exclusively to the requested project");
    expect(run.contract.request).not.toContain("Maya Noor");
    expect(run.contract.request).not.toContain("Do not include");
    for (const content of [readme, requirementEvidence, planEvidence, summaryEvidence]) {
      expect(content).toContain("Bella Tavola");
      expect(content).not.toContain("Maya Noor");
      expect(content).not.toContain("portfolio, designer");
    }
  }, 30_000);

  it("redacts short no-content exclusions from isolated Maya and Bella material", async () => {
    const mayaRecord = persistenceRecorder();
    const bellaRecord = persistenceRecorder();
    const maya = await pipeline.runVerifiedBuild({
      userId: 730,
      projectId: 830,
      conversationId: 930,
      request: "Build Maya Noor Portfolio with selected work, biography, skills, and a contact call to action. No Bella Tavola or restaurant content.",
      persistence: mayaRecord.persistence,
      gitExecutable: null,
    });
    const bella = await pipeline.runVerifiedBuild({
      userId: 731,
      projectId: 831,
      conversationId: 931,
      request: "Build Bella Tavola Restaurant with menu highlights, hours, a reservation form, and client-side validation. No Maya Noor or portfolio content.",
      persistence: bellaRecord.persistence,
      gitExecutable: null,
    });
    completedRuns.push(maya.id, bella.id);

    const [mayaReadme, mayaContract, bellaReadme, bellaContract] = await Promise.all([
      readFile(path.join(maya.workspaceRoot, "README.md"), "utf8"),
      readFile(path.join(maya.workspaceRoot, "evidence", "requirement-contract.json"), "utf8"),
      readFile(path.join(bella.workspaceRoot, "README.md"), "utf8"),
      readFile(path.join(bella.workspaceRoot, "evidence", "requirement-contract.json"), "utf8"),
    ]);

    expect(maya.contract.request).not.toMatch(/bella tavola|restaurant/i);
    expect(bella.contract.request).not.toMatch(/maya noor|portfolio/i);
    for (const content of [mayaReadme, mayaContract]) expect(content).not.toMatch(/bella tavola|restaurant/i);
    for (const content of [bellaReadme, bellaContract]) expect(content).not.toMatch(/maya noor|portfolio/i);
  }, 60_000);

  it("exports only contract-required capability details in Maya and retains Bella reservation evidence", async () => {
    const mayaRecord = persistenceRecorder();
    const bellaRecord = persistenceRecorder();
    const maya = await pipeline.runVerifiedBuild({
      userId: 728,
      projectId: 828,
      conversationId: 928,
      request: "Build a polished personal portfolio website for Maya Noor with selected work, an about section, and a contact call-to-action.",
      persistence: mayaRecord.persistence,
      gitExecutable: null,
    });
    const bella = await pipeline.runVerifiedBuild({
      userId: 729,
      projectId: 829,
      conversationId: 929,
      request: "Build a refined Bella Tavola restaurant landing page with menu highlights, reservations, location, a gallery, and an external reservation service integration.",
      persistence: bellaRecord.persistence,
      gitExecutable: null,
    });
    completedRuns.push(maya.id, bella.id);

    const [mayaSummary, bellaSummary] = await Promise.all([
      readFile(path.join(maya.workspaceRoot, "evidence", "build-summary.json"), "utf8"),
      readFile(path.join(bella.workspaceRoot, "evidence", "build-summary.json"), "utf8"),
    ]);
    expect(mayaSummary).not.toContain("external-reservation-integration");
    expect(mayaSummary).not.toMatch(/reservation backend|restaurant/i);
    expect(bellaSummary).toContain("external-reservation-integration");

    await rm(maya.workspaceRoot, { recursive: true, force: true });
    await rm(bella.workspaceRoot, { recursive: true, force: true });
    const [mayaArchive, bellaArchive] = await Promise.all([
      pipeline.exportBuildWorkspaceZip(maya, mayaRecord.persistence),
      pipeline.exportBuildWorkspaceZip(bella, bellaRecord.persistence),
    ]);
    const mayaZipText = mayaArchive.toString("utf8");
    const bellaZipText = bellaArchive.toString("utf8");
    expect(mayaZipText).toContain("smartbuild-snapshot/evidence/build-summary.json");
    expect(mayaZipText).not.toContain("external-reservation-integration");
    expect(mayaZipText).not.toMatch(/reservation backend|restaurant/i);
    expect(bellaZipText).toContain("external-reservation-integration");
  }, 30_000);

  it("blocks a generic backend request with generated evidence rather than failing with an unregistered verifier", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.runVerifiedBuild({ userId: 721, projectId: 821, conversationId: 921, request: "Build a project dashboard with a backend API and database persistence.", persistence: record.persistence, gitExecutable: null });
    completedRuns.push(run.id);

    expect(run.status).toBe("blocked");
    expect(run.checkpoint).toBeUndefined();
    expect(run.test?.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ criterionId: "backend-api-runtime", status: "BLOCKED" }),
      expect.objectContaining({ criterionId: "database-schema-persistence", status: "BLOCKED" }),
    ]));
    expect(run.test?.checks.join("\n")).not.toContain("No verifier was registered");
  }, 30_000);

  it("isolates Maya Noor and Bella Tavola artifacts by Build Run even within one project", async () => {
    const record = persistenceRecorder();
    const maya = await pipeline.createProjectFromRequest({ userId: 722, projectId: 822, conversationId: 922, buildId: "maya-run", request: "Build a refined personal portfolio website for Maya Noor with selected editorial design work and a contact section.", persistence: record.persistence });
    const bella = await pipeline.createProjectFromRequest({ userId: 722, projectId: 822, conversationId: 923, buildId: "bella-run", request: "Build a refined responsive restaurant website for Bella Tavola with menu, location, reservations, gallery, map, and newsletter.", persistence: record.persistence });
    completedRuns.push(maya.id, bella.id);

    expect(maya.workspaceRoot).not.toBe(bella.workspaceRoot);
    expect(maya.workspaceRoot).toContain(path.join("project-822", "build-maya-run"));
    expect(bella.workspaceRoot).toContain(path.join("project-822", "build-bella-run"));

    await pipeline.writeArtifactsToWorkspace(maya, record.persistence);
    await pipeline.writeArtifactsToWorkspace(bella, record.persistence);

    await expect(readFile(path.join(maya.workspaceRoot, "README.md"), "utf8")).resolves.toContain("Maya Noor");
    await expect(readFile(path.join(maya.workspaceRoot, "README.md"), "utf8")).resolves.not.toContain("Bella Tavola");
    await expect(readFile(path.join(bella.workspaceRoot, "README.md"), "utf8")).resolves.toContain("Bella Tavola");
    await expect(readFile(path.join(bella.workspaceRoot, "README.md"), "utf8")).resolves.not.toContain("Maya Noor");
  });

  it("restores only the requested Build Run artifacts after an ephemeral workspace is removed", async () => {
    const record = persistenceRecorder();
    const maya = await pipeline.createProjectFromRequest({ userId: 723, projectId: 823, conversationId: 923, buildId: "maya-reload", request: "Build a personal portfolio for Maya Noor.", persistence: record.persistence });
    const bella = await pipeline.createProjectFromRequest({ userId: 723, projectId: 823, conversationId: 924, buildId: "bella-reload", request: "Build a restaurant website for Bella Tavola with menu and reservations.", persistence: record.persistence });
    completedRuns.push(maya.id, bella.id);

    await pipeline.writeArtifactsToWorkspace(maya, record.persistence);
    await pipeline.writeArtifactsToWorkspace(bella, record.persistence);
    await rm(maya.workspaceRoot, { recursive: true, force: true });
    await rm(bella.workspaceRoot, { recursive: true, force: true });

    await pipeline.restoreBuildWorkspace(maya, record.persistence);

    await expect(readFile(path.join(maya.workspaceRoot, "README.md"), "utf8")).resolves.toContain("Maya Noor");
    await expect(readFile(path.join(maya.workspaceRoot, "README.md"), "utf8")).resolves.not.toContain("Bella Tavola");
    await expect(readFile(path.join(bella.workspaceRoot, "README.md"), "utf8")).rejects.toThrow();
  });

  it("reconciles a stale Build Run manifest with persisted source files", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({ userId: 725, projectId: 825, conversationId: 925, buildId: "manifest-reload", request: "Build a personal portfolio for Maya Noor.", persistence: record.persistence });
    completedRuns.push(run.id);

    await pipeline.writeArtifactsToWorkspace(run, record.persistence);
    run.artifacts = [];
    await rm(run.workspaceRoot, { recursive: true, force: true });

    await pipeline.restoreBuildWorkspace(run, record.persistence);

    const expectedModularFiles = [
      "index.html",
      "styles/custom.css",
      "src/app-shell.js",
      "src/components/custom-components.js",
      "src/pages/custom-page.js",
      "src/state/custom-state.js",
      "src/utils/dom.js",
      "src/types/custom.js",
      "tests/custom.test.js",
      "src/custom.js",
      "data/custom.json",
      "project.manifest.json",
      "README.md",
    ];
    expect(pipeline.listBuildWorkspaceFiles(run.id).map(file => file.path)).toEqual(expect.arrayContaining(expectedModularFiles));
    expect(run.artifacts.map(file => file.path)).toEqual(expect.arrayContaining(expectedModularFiles));
  });

  it("claims only matching legacy artifacts before restoring a Build Run after deployment migration", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({ userId: 724, projectId: 824, conversationId: 924, buildId: "legacy-reload", request: "Build a personal portfolio for Maya Noor.", persistence: record.persistence });
    completedRuns.push(run.id);
    record.writtenArtifacts.push({ userId: 724, path: "README.md", content: "# Maya Noor\nMigrated legacy artifact", buildRunId: undefined });
    let claims = 0;
    const persistence = {
      ...record.persistence,
      claimLegacyGeneratedFilesForBuildRun: async (input: { buildRunId: string }) => {
        claims += 1;
        for (const artifact of record.writtenArtifacts) if (!artifact.buildRunId) artifact.buildRunId = input.buildRunId;
        return 1;
      },
    };

    await pipeline.restoreBuildWorkspace(run, persistence);

    expect(claims).toBe(1);
    await expect(readFile(path.join(run.workspaceRoot, "README.md"), "utf8")).resolves.toContain("Migrated legacy artifact");
  });

  it("persists Build Run file edits and deletions and invalidates previous verification", async () => {
    const record = persistenceRecorder();
    const run = await pipeline.createProjectFromRequest({
      userId: 726,
      projectId: 826,
      conversationId: 926,
      buildId: "manual-file-edit",
      request: "Build a personal portfolio for Maya Noor.",
      persistence: record.persistence,
    });
    completedRuns.push(run.id);
    run.status = "succeeded";
    run.checkpoint = { type: "checkpointed_snapshot", revision: "old-revision", message: "Verified", createdAt: new Date().toISOString() };
    const filePath = "src/custom-manual-module.js";
    const content = "export const manualModule = true;\n";

    await pipeline.saveBuildRunWorkspaceFile(run, filePath, content, record.persistence, true);

    expect(record.writtenArtifacts).toContainEqual(expect.objectContaining({ path: filePath, content, buildRunId: run.id }));
    expect(run.manualChangesPendingVerification).toBe(true);
    expect(run.checkpoint).toBeUndefined();
    expect(run.test).toBeUndefined();
    expect(run.manifest?.files).toContainEqual(expect.objectContaining({ path: filePath, status: "created" }));

    await pipeline.deleteBuildRunWorkspaceFile(run, filePath, record.persistence);

    expect(record.writtenArtifacts.some(file => file.path === filePath && file.buildRunId === run.id)).toBe(false);
    expect(run.manifest?.files.some(file => file.path === filePath)).toBe(false);
    await expect(readFile(path.join(run.workspaceRoot, filePath), "utf8")).rejects.toThrow();
  });
});

afterEach(async () => {
  for (const buildId of completedRuns.splice(0)) await pipeline.stopBuildPreview(buildId);
  await rm(testRoot, { recursive: true, force: true });
});
