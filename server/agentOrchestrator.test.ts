import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runBuildAgentOrchestration, runOnePythonProductionAgent } from "./agentOrchestrator";

const previousWorkspaceRoot = process.env.SMARTBUILD_WORKSPACE_ROOT;
const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  if (previousWorkspaceRoot === undefined) delete process.env.SMARTBUILD_WORKSPACE_ROOT;
  else process.env.SMARTBUILD_WORKSPACE_ROOT = previousWorkspaceRoot;
});

describe("canonical server agent orchestrator", () => {
  it("routes the build to one agent and persists the capability dry-run plan and trace", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "smartbuild-agent-orchestrator-"));
    cleanupRoots.push(root);
    const workspaceRoot = path.join(root, "project-101");
    await mkdir(workspaceRoot, { recursive: true });
    process.env.SMARTBUILD_WORKSPACE_ROOT = root;

    const summary = await runBuildAgentOrchestration({ buildRunId: "agent-bridge-101", projectId: 101, conversationId: 201, request: "Build a responsive SaaS landing page", workspaceRoot });

    expect(summary.registryCount).toBe(300);
    expect(summary.executionMode).toBe("dry-run");
    expect(summary.checkpointAllowed).toBeTypeOf("boolean");
    const selectedAgentIds = summary.selectedAgents.map(agent => agent.id);
    expect(selectedAgentIds).toEqual(["smartbuild-website-builder-agent"]);
    expect(summary.internalizedCapabilityCount).toBeGreaterThan(0);
    expect(summary.tasks).toHaveLength(1);
    expect(summary.tasks[0]).toMatchObject({
      agentId: "smartbuild-website-builder-agent",
      title: "Analyze and implement the website",
    });
    expect(summary.skippedAgents).toHaveLength(300 - summary.internalizedCapabilityCount!);
    expect(summary.traceFile).toMatch(/^agent-bridge-101\.jsonl$/);
    expect(summary.skippedAgents.every(agent => agent.reason === "TRIGGER_NOT_MATCHED_OR_NOT_REQUIRED")).toBe(true);
    expect(summary.tasks.every(task => [
      "REQUEST_CAPABILITY_MATCH",
      "SCOPED_WORKFLOW_DEPENDENCY",
      "VERIFICATION_GATE_REQUIRED",
      "CHECKPOINT_AFTER_VERIFICATION",
    ].includes(task.selectedReason))).toBe(true);
    const plan = await readFile(path.join(workspaceRoot, "evidence", "agent-plan.json"), "utf8");
    const trace = await readFile(path.join(workspaceRoot, "evidence", "agent-traces", summary.traceFile!), "utf8");
    expect(plan).toContain('"registryCount": 300');
    expect(plan).toContain('"capabilityPlan"');
    expect(plan).not.toMatch(/workspaceRoot|api[_-]?key|access[_-]?token|session[_-]?token|bearer\s/i);
    expect(plan).not.toMatch(/Build a responsive SaaS landing page|selected because|matched request/i);
    const traceEvents = trace.trim().split(/\r?\n/).map(line => JSON.parse(line) as { event?: unknown });
    expect(traceEvents.length).toBeGreaterThan(0);
    expect(traceEvents.every(event => typeof event.event === "string" && event.event.startsWith("agent."))).toBe(true);
  }, 30_000);

  it("keeps the supported contact-form workflow out of the generic unsupported backend route", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "smartbuild-agent-contact-classification-"));
    cleanupRoots.push(root);
    const workspaceRoot = path.join(root, "project-103");
    await mkdir(workspaceRoot, { recursive: true });
    process.env.SMARTBUILD_WORKSPACE_ROOT = root;

    const summary = await runBuildAgentOrchestration({
      buildRunId: "agent-contact-classification-103",
      projectId: 103,
      conversationId: 203,
      request: "Build a contact page with a real form. Validate name, email, and message fields, submit to a backend endpoint, save the submission in the project database, and create Playwright tests.",
      workspaceRoot,
    });

    expect(summary.checkpointAllowed).toBe(true);
    expect(summary.blockedReason).toBeNull();
  }, 30_000);

  it("keeps planning dry-run separate from production single-agent execution", async () => {
    const orchestrator = await readFile(path.join(process.cwd(), "server", "agentOrchestrator.ts"), "utf8");
    const runner = await readFile(path.join(process.cwd(), "server", "agents", "runner.py"), "utf8");
    expect(orchestrator).toContain('"--mode", "dry-run"');
    expect(orchestrator).toContain('"--mode", "production", "--agent-id"');
    expect(orchestrator).not.toContain('"--mode", "dry-run", "--agent-id"');
    expect(runner).toContain('dry_run=args.mode != "production"');
    expect(runner).not.toContain("dry_run=True");
  });

  it("executes exactly one selected Python responsibility in production mode with scoped evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "smartbuild-agent-production-"));
    cleanupRoots.push(root);
    const workspaceRoot = path.join(root, "project-102");
    await mkdir(workspaceRoot, { recursive: true });
    process.env.SMARTBUILD_WORKSPACE_ROOT = root;

    const execution = await runOnePythonProductionAgent({
      buildRunId: "agent-production-102", projectId: 102, conversationId: 202, request: "Define the product strategy and brief for a subscription offering.", workspaceRoot,
      taskId: "agent-production-102:agent_071", agentId: "agent_071",
    });

    expect(execution).toMatchObject({ status: "succeeded", traceFile: "agent-production-102.jsonl" });
    expect(execution.changedFiles).toContain("agent-artifacts/pr-001/agent-production-102_agent_071.md");
    expect(execution.evidenceRefs).toEqual([expect.stringMatching(/^evidence\/agent-executions\/agent-production-102_agent_071\.json#sha256:/)]);
    expect(execution.executionMetadata).toEqual({
      producedArtifactCount: expect.any(Number),
      verificationCount: expect.any(Number),
      nextActionCount: expect.any(Number),
    });
    expect(Object.values(execution.executionMetadata).every(value => Number.isSafeInteger(value) && value >= 0)).toBe(true);
    await expect(readFile(path.join(workspaceRoot, "agent-artifacts", "pr-001", "agent-production-102_agent_071.md"), "utf8")).resolves.toContain("**Canonical agent:** `agent_071`");
    await expect(readFile(path.join(workspaceRoot, "evidence", "agent-executions", "agent-production-102_agent_071.json"), "utf8")).resolves.toContain('"agentId":"agent_071"');
  }, 30_000);

  it("writes different request-category source files for isolated portfolio and restaurant production tasks", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "smartbuild-agent-source-output-"));
    cleanupRoots.push(root);
    process.env.SMARTBUILD_WORKSPACE_ROOT = root;
    const scenarios = [
      { buildRunId: "agent-source-portfolio", projectId: 103, conversationId: 203, request: "Build a responsive portfolio UI with selected projects." },
      { buildRunId: "agent-source-restaurant", projectId: 104, conversationId: 204, request: "Build a responsive restaurant UI with a menu and table booking section." },
    ];
    const pages: string[] = [];
    const stylesheets: string[] = [];

    for (const scenario of scenarios) {
      const workspaceRoot = path.join(root, `project-${scenario.projectId}`);
      await mkdir(workspaceRoot, { recursive: true });
      const execution = await runOnePythonProductionAgent({
        ...scenario,
        workspaceRoot,
        taskId: `${scenario.buildRunId}:agent_005`,
        agentId: "agent_005",
      });
      expect(execution).toMatchObject({ status: "succeeded" });
      expect(execution.changedFiles).toEqual(expect.arrayContaining(["index.html", "app.js"]));
      const page = await readFile(path.join(workspaceRoot, "index.html"), "utf8");
      expect(page).toContain(`scope-v1-`);
      expect(page).not.toContain(scenario.request);
      expect(page).not.toContain(workspaceRoot);
      pages.push(page);

      const cssExecution = await runOnePythonProductionAgent({
        ...scenario,
        workspaceRoot,
        taskId: `${scenario.buildRunId}:agent_030`,
        agentId: "agent_030",
      });
      expect(cssExecution).toMatchObject({ status: "succeeded" });
      expect(cssExecution.changedFiles.some(file => file.endsWith("/styles.css") || file === "styles.css")).toBe(true);
      const stylesheet = await readFile(path.join(workspaceRoot, "styles.css"), "utf8");
      expect(stylesheet).not.toContain(scenario.request);
      expect(stylesheet).not.toContain(workspaceRoot);
      stylesheets.push(stylesheet);
    }

    expect(pages[0]).toContain("Portfolio website");
    expect(pages[1]).toContain("Restaurant website");
    expect(pages[0]).toContain('data-site-profile="portfolio"');
    expect(pages[0]).toContain("Selected work");
    expect(pages[0]).toContain("Working together");
    expect(pages[1]).toContain('data-site-profile="restaurant"');
    expect(pages[1]).toContain("Menu highlights");
    expect(pages[1]).toContain("Plan your visit");
    expect(pages[0]).not.toEqual(pages[1]);
    expect(stylesheets[0]).toContain("#15365e");
    expect(stylesheets[1]).toContain("#7c3e1d");
    expect(stylesheets[0]).toContain("min-height:22rem");
    expect(stylesheets[1]).toContain("grid-template-columns:.85fr 1.15fr");
    expect(stylesheets[0]).not.toEqual(stylesheets[1]);
  }, 30_000);

  it("writes an isolated contact page with bounded local validation and no external submission", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "smartbuild-agent-contact-output-"));
    cleanupRoots.push(root);
    process.env.SMARTBUILD_WORKSPACE_ROOT = root;
    const scenario = {
      buildRunId: "agent-source-contact", projectId: 105, conversationId: 205,
      request: "Build a responsive contact form for a design studio.",
    };
    const workspaceRoot = path.join(root, "project-105");
    await mkdir(workspaceRoot, { recursive: true });

    const plan = await runBuildAgentOrchestration({ ...scenario, workspaceRoot });
    expect(plan.selectedAgents.map(agent => agent.id)).toEqual(["smartbuild-website-builder-agent"]);
    expect(plan.internalizedCapabilityCount).toBeGreaterThan(0);

    for (const agentId of ["agent_005", "agent_007", "agent_030"] as const) {
      const execution = await runOnePythonProductionAgent({
        ...scenario, workspaceRoot, taskId: `${scenario.buildRunId}:${agentId}`, agentId,
      });
      expect(execution).toMatchObject({ status: "succeeded" });
    }

    const [page, app, validation, stylesheet] = await Promise.all([
      readFile(path.join(workspaceRoot, "index.html"), "utf8"),
      readFile(path.join(workspaceRoot, "app.js"), "utf8"),
      readFile(path.join(workspaceRoot, "form-validation.js"), "utf8"),
      readFile(path.join(workspaceRoot, "styles.css"), "utf8"),
    ]);
    expect(page).toContain('data-site-profile="contact"');
    expect(page).toContain('id="contact-form"');
    expect(page).toContain('form-validation.js');
    expect(app).toContain("event.preventDefault()");
    expect(app).toContain("Message delivery is not configured.");
    expect(validation).toContain("SmartBuildFormValidation");
    expect(validation).not.toMatch(/fetch\(|XMLHttpRequest|https?:\/\//);
    expect(stylesheet).toContain(".contact-form");
    for (const output of [page, app, validation, stylesheet]) {
      expect(output).not.toContain(scenario.request);
      expect(output).not.toContain(workspaceRoot);
    }
  }, 30_000);
});
