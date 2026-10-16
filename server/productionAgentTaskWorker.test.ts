import { describe, expect, it, vi } from "vitest";

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runOneProductionAgentTask, shouldUseCanonicalPythonWriter, type ProductionAgentWorkerInput } from "./productionAgentTaskWorker";
import { AI_MODEL_IDS } from "@shared/aiModels";

const input: ProductionAgentWorkerInput = {
  scope: { userId: 4, projectId: 5, conversationId: 6, buildRunId: "run-7" },
  requirement: "Create a product page.", workspaceRoot: "/tmp/agent-worker", knownFiles: [],
  tasks: [{
    taskId: "task-1", agentId: "agent_071", agentName: "Product Role Agent", role: "product", purpose: "implement page",
    canWriteWorkspace: true, allowedPathScopes: ["project/**"], verificationMethods: ["structured-evidence"],
  }],
};

const additiveAction = {
  id: "pr-001-1", status: "proposed", responsibility: "Problem framing",
  instruction: "Produce a bounded product brief.", verification: ["structured-evidence"],
};

const originalInput: ProductionAgentWorkerInput = {
  ...input,
  tasks: [{
    ...input.tasks[0], taskId: "original-task", agentId: "agent_003", agentName: "Original Content Agent",
    allowedPathScopes: ["project/**", "agent-artifacts/**"],
  }],
};

const originalReportPath = "agent-artifacts/original/agent_003/original-task.md";
const originalManifestPath = "agent-artifacts/original/agent_003/original-task.work-product.json";

function originalManifest(overrides: Record<string, unknown> = {}) {
  const base = {
    format: "smartbuild-agent-work-product-v1",
    canonicalAgentId: "agent_003",
    agentKind: "original-canonical",
    buildScope: { buildRunId: "run-7", projectId: 5, conversationId: 6, taskId: "original-task" },
    actions: [{ kind: "responsibility-report", status: "completed" }],
    externalActions: "not-performed",
  };
  return { ...base, ...overrides, buildScope: { ...base.buildScope, ...(overrides.buildScope as Record<string, unknown> | undefined) } };
}

function writeOriginalWorkProducts(workspaceRoot: string, manifest: Record<string, unknown>, includeReport = true) {
  mkdirSync(path.join(workspaceRoot, path.dirname(originalManifestPath)), { recursive: true });
  if (includeReport) writeFileSync(path.join(workspaceRoot, originalReportPath), "# Scoped responsibility report\n", "utf8");
  writeFileSync(path.join(workspaceRoot, originalManifestPath), JSON.stringify(manifest), "utf8");
}

describe("production agent task worker", () => {
  it("blocks legacy implementation tasks without invoking or persisting model output", async () => {
    const execute = vi.fn().mockResolvedValue({
      status: "succeeded",
      summary: "Changed the project.",
      changedFiles: [{ path: "client/App.tsx", content: "export const App = () => <main />;" }],
      verification: [{ name: "validated-file-output", result: "pass" }],
      evidenceRefs: [],
    });
    const result = await runOneProductionAgentTask({
      ...input,
      tasks: [{
        ...input.tasks[0]!,
        agentId: "smartbuild-website-builder-agent",
        agentName: "Archived implementation record",
        role: "Legacy project task",
        allowedPathScopes: ["client/**"],
        allowedReadPathScopes: ["client/**"],
      }],
    }, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "smartbuild-website-builder-agent" }),
      complete: vi.fn().mockResolvedValue(true),
      execute,
      persist: vi.fn().mockResolvedValue(["client/App.tsx"]),
      persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/task-1.json"]),
    });

    expect(result).toMatchObject({ state: "blocked", agentId: "smartbuild-website-builder-agent", reason: "BUILD_EXECUTION_DISABLED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses the selected Claude model path instead of the Python writer for a website build", async () => {
    const execute = vi.fn().mockResolvedValue({
      status: "succeeded",
      summary: "Implemented with the selected model.",
      changedFiles: [{ path: "src/App.tsx", content: "export const App = () => <main />;" }],
      verification: [{ name: "validated-file-output", result: "pass" }],
      evidenceRefs: [],
    });
    const executePython = vi.fn();
    const result = await runOneProductionAgentTask({
      ...input,
      model: AI_MODEL_IDS.claude,
      tasks: [{ ...input.tasks[0]!, agentId: "agent_071", allowedReadPathScopes: ["src/**"] }],
    }, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }),
      complete: vi.fn().mockResolvedValue(true),
      execute,
      executePython,
      persist: vi.fn().mockResolvedValue(["src/App.tsx"]),
      persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/task-1.json"]),
    });

    expect(result).toMatchObject({ state: "succeeded", agentId: "agent_071" });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ model: AI_MODEL_IDS.claude }));
    expect(executePython).not.toHaveBeenCalled();
  });

  it.each([
    ["Anthropic structured request failed with status 429.", "ANTHROPIC_RATE_LIMITED"],
    ["Anthropic structured request failed with status 402.", "ANTHROPIC_BILLING_REQUIRED"],
    ["Anthropic structured request failed with status 529.", "ANTHROPIC_TEMPORARILY_UNAVAILABLE"],
    [Object.assign(new Error("The operation timed out."), { name: "TimeoutError" }), "AGENT_PROVIDER_REQUEST_TIMEOUT"],
    [new TypeError("fetch failed"), "AGENT_PROVIDER_CONNECTION_FAILED"],
  ])("preserves an actionable provider failure code for %s", async (detail, code) => {
    const complete = vi.fn().mockResolvedValue(true);
    const result = await runOneProductionAgentTask({
      ...input,
      model: AI_MODEL_IDS.claude,
      tasks: [{ ...input.tasks[0]!, agentId: "agent_071", allowedReadPathScopes: ["src/**"] }],
    }, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }),
      complete,
      execute: vi.fn().mockRejectedValue(detail instanceof Error ? detail : new Error(detail)),
    });

    expect(result).toMatchObject({ state: "failed", code });
    expect(complete).toHaveBeenCalledWith(input.scope, "task-1", expect.any(String), expect.objectContaining({
      status: "failed",
      blockedReason: code,
    }));
  });

  it("keeps legacy canonical model-backed writers off the Python template path", () => {
    expect(shouldUseCanonicalPythonWriter("agent_005", false)).toBe(false);
    expect(shouldUseCanonicalPythonWriter("agent_030", false)).toBe(false);
    expect(shouldUseCanonicalPythonWriter("agent_007", false)).toBe(true);
    expect(shouldUseCanonicalPythonWriter("agent_005", true)).toBe(true);
    expect(shouldUseCanonicalPythonWriter("system.verification_gate", false)).toBe(false);
  });

  it.each(["agent_005", "agent_030"])("%s uses the local model execution path in production", async agentId => {
    const execute = vi.fn().mockResolvedValue({
      status: "succeeded",
      summary: "Generated scoped source with the local production model.",
      changedFiles: [{ path: "src/App.tsx", content: "export const App = () => <main />;" }],
      verification: [{ name: "scoped-output", result: "pass" }],
      evidenceRefs: [],
    });
    const result = await runOneProductionAgentTask({
      ...input,
      tasks: [{
        ...input.tasks[0]!,
        agentId,
        allowedReadPathScopes: ["src/**"],
      }],
    }, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId }),
      complete: vi.fn().mockResolvedValue(true),
      execute,
      persist: vi.fn().mockResolvedValue(["src/App.tsx"]),
      persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/task-1.json"]),
    });

    expect(result).toMatchObject({ state: "succeeded", agentId });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("renews the task lease while the local model is still generating", async () => {
    vi.useFakeTimers();
    let finishExecution!: (outcome: {
      status: "succeeded";
      summary: string;
      changedFiles: { path: string; content: string }[];
      verification: { name: string; result: "pass" }[];
      evidenceRefs: string[];
    }) => void;
    const execute = vi.fn(() => new Promise<{
      status: "succeeded";
      summary: string;
      changedFiles: { path: string; content: string }[];
      verification: { name: string; result: "pass" }[];
      evidenceRefs: string[];
    }>(resolve => { finishExecution = resolve; }));
    const renew = vi.fn().mockResolvedValue(true);
    const running = runOneProductionAgentTask(input, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }),
      renew,
      complete: vi.fn().mockResolvedValue(true),
      execute,
      persist: vi.fn().mockResolvedValue(["src/App.tsx"]),
      persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/task-1.json"]),
    });

    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(30_000);
    expect(renew).toHaveBeenCalledWith(input.scope, "task-1", expect.any(String), 30 * 60 * 1000);
    finishExecution({
      status: "succeeded",
      summary: "Generated the requested file.",
      changedFiles: [{ path: "src/App.tsx", content: "export const App = () => <main />;" }],
      verification: [{ name: "scoped-output", result: "pass" }],
      evidenceRefs: [],
    });
    await expect(running).resolves.toMatchObject({ state: "succeeded", agentId: "agent_071" });
  });

  it("passes only scoped existing source files to the production model", async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), "smartbuild-agent-source-"));
    try {
      mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
      mkdirSync(path.join(workspaceRoot, "private"), { recursive: true });
      writeFileSync(path.join(workspaceRoot, "src", "App.tsx"), "export const App = () => <main>Current source</main>;", "utf8");
      writeFileSync(path.join(workspaceRoot, "private", "secret.ts"), "const hidden = true;", "utf8");
      const task = { ...input.tasks[0]!, allowedReadPathScopes: ["src/**"] };
      const execute = vi.fn().mockResolvedValue({
        status: "succeeded",
        summary: "updated",
        changedFiles: [{ path: "src/App.tsx", content: "updated source" }],
        verification: [],
        evidenceRefs: [],
      });

      await runOneProductionAgentTask({
        ...input,
        workspaceRoot,
        knownFiles: ["src/App.tsx", "private/secret.ts"],
        tasks: [task],
      }, {
        claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }),
        complete: vi.fn().mockResolvedValue(true),
        execute,
        persist: vi.fn().mockResolvedValue(["src/App.tsx"]),
        persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/task-1.json"]),
      });

      expect(execute.mock.calls[0]?.[1].sourceFiles).toEqual([
        { path: "src/App.tsx", content: "export const App = () => <main>Current source</main>;" },
      ]);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("provides more than 40 small scoped existing source files to the production model", async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), "smartbuild-agent-source-limit-"));
    try {
      mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
      const knownFiles = Array.from({ length: 100 }, (_, index) => {
        const relativePath = `src/module-${index}.ts`;
        writeFileSync(path.join(workspaceRoot, relativePath), `export const module${index} = ${index};`, "utf8");
        return relativePath;
      });
      const task = { ...input.tasks[0]!, allowedReadPathScopes: ["src/**"] };
      const execute = vi.fn().mockResolvedValue({
        status: "succeeded",
        summary: "updated",
        changedFiles: [{ path: "src/module-0.ts", content: "updated source" }],
        verification: [],
        evidenceRefs: [],
      });

      await runOneProductionAgentTask({
        ...input,
        workspaceRoot,
        knownFiles,
        tasks: [task],
      }, {
        claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }),
        complete: vi.fn().mockResolvedValue(true),
        execute,
        persist: vi.fn().mockResolvedValue(["src/module-0.ts"]),
        persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/task-1.json"]),
      });

      expect(execute.mock.calls[0]?.[1].sourceFiles).toHaveLength(100);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it.each([40, 100])("persists Python-writer output above the former 40-file cap (%i source files)", async sourceFileCount => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), "smartbuild-python-source-limit-"));
    const taskId = "task-1";
    const reportPath = `agent-artifacts/original/agent_005/${taskId}.md`;
    const manifestPath = `agent-artifacts/original/agent_005/${taskId}.work-product.json`;
    const sourcePaths = Array.from({ length: sourceFileCount }, (_, index) => `src/module-${index}.js`);
    const executePython = vi.fn().mockResolvedValue({
      status: "succeeded",
      evidenceRefs: [],
      changedFiles: [...sourcePaths, reportPath, manifestPath],
      traceFile: "run-7-agent-005.jsonl",
      executionMetadata: { producedArtifactCount: sourceFileCount + 2, verificationCount: 1, nextActionCount: 0 },
    });
    const persist = vi.fn().mockImplementation(async (_workerInput, files: { path: string }[]) => files.map(file => file.path));
    const scope = {
      buildRunId: "run-7",
      projectId: 5,
      conversationId: 6,
    };
    try {
      for (const relativePath of sourcePaths) {
        const absolutePath = path.join(workspaceRoot, relativePath);
        mkdirSync(path.dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, "export {};\n", "utf8");
      }
      const reportAbsolutePath = path.join(workspaceRoot, reportPath);
      const manifestAbsolutePath = path.join(workspaceRoot, manifestPath);
      mkdirSync(path.dirname(reportAbsolutePath), { recursive: true });
      writeFileSync(reportAbsolutePath, "# Functional component engineer report\n", "utf8");
      writeFileSync(manifestAbsolutePath, JSON.stringify({
        format: "smartbuild-agent-work-product-v1",
        canonicalAgentId: "agent_005",
        agentKind: "original-canonical",
        buildScope: { buildRunId: "run-7", projectId: 5, conversationId: 6, taskId },
        actions: [{ kind: "responsibility-report", status: "completed" }],
        externalActions: "not-performed",
      }), "utf8");

      const result = await runOneProductionAgentTask({
        ...input,
        scope: { userId: 4, ...scope },
        workspaceRoot,
        tasks: [{
          ...input.tasks[0]!,
          agentId: "agent_005",
          allowedPathScopes: ["project/**", "agent-artifacts/**"],
        }],
      }, {
        claim: vi.fn().mockResolvedValue({ taskId, agentId: "agent_005" }),
        complete: vi.fn().mockResolvedValue(true),
        executePython,
        execute: vi.fn(),
        persist,
        persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/task-1.json"]),
      });

      expect(result).toMatchObject({ state: "succeeded", agentId: "agent_005" });
      expect(persist.mock.calls[0]?.[1]).toHaveLength(sourceFileCount + 2);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("claims and persists exactly one successful scoped task", async () => {
    const complete = vi.fn().mockResolvedValue(true);
    const persist = vi.fn().mockResolvedValue(["src/App.tsx"]);
    const result = await runOneProductionAgentTask(input, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }), complete, persist, persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/task-1.json"]),
      execute: vi.fn().mockResolvedValue({ status: "succeeded", summary: "done", changedFiles: [{ path: "src/App.tsx", content: "x" }], verification: [], evidenceRefs: ["agent-output:agent_071:task-1:deadbeefdeadbeef"] }),
    });
    expect(result).toMatchObject({ state: "succeeded", taskId: "task-1", artifactRefs: ["src/App.tsx"] });
    expect(complete).toHaveBeenCalledWith(input.scope, "task-1", expect.any(String), expect.objectContaining({ status: "succeeded" }));
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("fails before persistence when a task emits duplicate output paths", async () => {
    const persist = vi.fn();
    const complete = vi.fn().mockResolvedValue(true);
    const result = await runOneProductionAgentTask(input, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }), complete, persist,
      execute: vi.fn().mockResolvedValue({
        status: "succeeded", summary: "duplicate output", verification: [], evidenceRefs: [],
        changedFiles: [
          { path: "src/App.tsx", content: "first" },
          { path: "src/App.tsx", content: "second" },
        ],
      }),
    });
    expect(result).toMatchObject({ state: "failed", code: "AGENT_OUTPUT_PATH_DUPLICATE" });
    expect(persist).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith(input.scope, "task-1", expect.any(String), expect.objectContaining({ status: "failed", blockedReason: "AGENT_OUTPUT_PATH_DUPLICATE" }));
  });

  it("stores a blocker without attempting artifact persistence", async () => {
    const persist = vi.fn();
    const result = await runOneProductionAgentTask(input, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }), complete: vi.fn().mockResolvedValue(true), persist, persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/task-1.json"]),
      execute: vi.fn().mockResolvedValue({ status: "blocked", summary: "blocked", changedFiles: [], verification: [], evidenceRefs: [], blockedReason: "EXTERNAL_PROVIDER_NOT_CONFIGURED" }),
    });
    expect(result).toMatchObject({ state: "blocked", reason: "EXTERNAL_PROVIDER_NOT_CONFIGURED" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("replaces a free-form blocker before durable persistence", async () => {
    const complete = vi.fn().mockResolvedValue(true);
    const result = await runOneProductionAgentTask(input, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }), complete, persist: vi.fn(), persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/task-1.json"]),
      execute: vi.fn().mockResolvedValue({ status: "blocked", summary: "blocked", changedFiles: [], verification: [], evidenceRefs: [], blockedReason: "RAW_REQUEST_SECRET_MARKER" }),
    });
    expect(result).toMatchObject({ state: "blocked", reason: "AGENT_TASK_BLOCKED" });
    expect(complete).toHaveBeenCalledWith(input.scope, "task-1", expect.any(String), expect.objectContaining({ status: "blocked", blockedReason: "AGENT_TASK_BLOCKED" }));
  });

  it("runs the matching Python responsibility before the model and persists its scoped artifact", async () => {
    const workspaceRoot = "/tmp/agent-worker-python-success";
    rmSync(workspaceRoot, { recursive: true, force: true });
    const pythonArtifact = "agent-artifacts/pr-001/task-1.md";
    const pythonManifest = "agent-artifacts/pr-001/task-1.work-product.json";
    mkdirSync(path.join(workspaceRoot, "agent-artifacts", "pr-001"), { recursive: true });
    writeFileSync(path.join(workspaceRoot, pythonArtifact), "# Product brief\nScoped request artifact.\n", "utf8");
    writeFileSync(path.join(workspaceRoot, pythonManifest), JSON.stringify({
      format: "smartbuild-agent-work-product-v1", canonicalAgentId: "agent_071",
      buildScope: { buildRunId: "run-7", projectId: 5, conversationId: 6, taskId: "task-1" },
      actions: [additiveAction], externalActions: "not-performed",
    }), "utf8");
    const callOrder: string[] = [];
    const executePython = vi.fn().mockImplementation(async () => {
      callOrder.push("python");
      return { status: "succeeded", evidenceRefs: ["evidence/agent-executions/task-1.json#sha256:abc"], changedFiles: [pythonArtifact, pythonManifest], traceFile: "run-7.jsonl", executionMetadata: { producedArtifactCount: 2, verificationCount: 3, nextActionCount: 1 } };
    });
    const complete = vi.fn().mockResolvedValue(true);
    const result = await runOneProductionAgentTask({ ...input, workspaceRoot }, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }), complete,
      execute: vi.fn().mockImplementation(async () => {
        callOrder.push("model");
        return { status: "succeeded", summary: "done", changedFiles: [{ path: "index.html", content: "<main />" }], verification: [{ name: "output", result: "pass", detail: "scoped" }], evidenceRefs: ["agent-output:agent_071:task-1:deadbeefdeadbeef"] };
      }),
      executePython, persist: vi.fn().mockImplementation(async (_workerInput, files) => files.map((file: { path: string }) => file.path)), persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/task-1.json"]),
    });
    expect(result).toMatchObject({ state: "succeeded", taskId: "task-1", artifactRefs: [pythonArtifact, pythonManifest] });
    expect(callOrder).toEqual(["python"]);
    expect(executePython).toHaveBeenCalledWith(expect.objectContaining({ buildRunId: "run-7", taskId: "task-1", agentId: "agent_071" }));
    expect(complete).toHaveBeenCalledWith(input.scope, "task-1", expect.any(String), expect.objectContaining({ evidenceRefs: ["evidence/agent-executions/task-1.json"] }));
    expect(complete).toHaveBeenCalledWith(input.scope, "task-1", expect.any(String), expect.objectContaining({ logs: expect.arrayContaining(["smartbuild-agent-execution-v1 artifacts=2 verification_passed=1 verification_blocked=0 additive_actions=1 python_produced_artifacts=2 python_verifications=3 python_next_actions=1"]) }));
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("persists request-scoped Python source files without calling the model when the selected writer produced them", async () => {
    const workspaceRoot = "/tmp/agent-worker-python-source";
    const sourceTask = { ...input.tasks[0], taskId: "source-task", agentId: "agent_005", agentName: "Functional Component Engineer", allowedPathScopes: ["index.html", "app.js", "agent-artifacts/**"] };
    const reportPath = "agent-artifacts/original/agent_005/source-task.md";
    const manifestPath = "agent-artifacts/original/agent_005/source-task.work-product.json";
    rmSync(workspaceRoot, { recursive: true, force: true });
    mkdirSync(path.join(workspaceRoot, "agent-artifacts", "original", "agent_005"), { recursive: true });
    writeFileSync(path.join(workspaceRoot, "index.html"), "<main><h1>Portfolio</h1></main>", "utf8");
    writeFileSync(path.join(workspaceRoot, "app.js"), "document.documentElement.dataset.ready = 'true';", "utf8");
    writeFileSync(path.join(workspaceRoot, reportPath), "# Scoped responsibility report\n", "utf8");
    writeFileSync(path.join(workspaceRoot, manifestPath), JSON.stringify({
      format: "smartbuild-agent-work-product-v1", canonicalAgentId: "agent_005", agentKind: "original-canonical",
      buildScope: { buildRunId: "run-7", projectId: 5, conversationId: 6, taskId: "source-task" },
      actions: [{ kind: "responsibility-report", status: "completed" }], externalActions: "not-performed",
    }), "utf8");
    const execute = vi.fn();
    const persist = vi.fn().mockImplementation(async (_workerInput, files) => files.map((file: { path: string }) => file.path));
    const complete = vi.fn().mockResolvedValue(true);
    const result = await runOneProductionAgentTask({ ...input, workspaceRoot, tasks: [sourceTask] }, {
      claim: vi.fn().mockResolvedValue({ taskId: "source-task", agentId: "agent_005" }), complete, execute, persist,
      executePython: vi.fn().mockResolvedValue({
        status: "succeeded", evidenceRefs: ["evidence/agent-executions/source-task.json#sha256:abc"],
        changedFiles: ["index.html", "app.js", reportPath, manifestPath], traceFile: "run-7-agent-005.jsonl",
        executionMetadata: { producedArtifactCount: 4, verificationCount: 1, nextActionCount: 0 },
      }),
      persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/source-task.json"]),
    });
    expect(result).toMatchObject({ state: "succeeded", taskId: "source-task", artifactRefs: ["index.html", "app.js", reportPath, manifestPath] });
    expect(execute).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining([
      expect.objectContaining({ path: "index.html", content: expect.stringContaining("Portfolio") }),
      expect.objectContaining({ path: "app.js" }),
    ]));
    expect(complete).toHaveBeenCalledWith(input.scope, "source-task", expect.any(String), expect.objectContaining({
      status: "succeeded", evidenceRefs: ["evidence/agent-executions/source-task.json"],
    }));
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("fails the first website writer rather than falling back to the template executor when Python emits no source file", async () => {
    const workspaceRoot = "/tmp/agent-worker-python-writer-without-source";
    const sourceTask = { ...input.tasks[0], taskId: "source-task", agentId: "agent_005", agentName: "Functional Component Engineer", allowedPathScopes: ["index.html", "agent-artifacts/**"] };
    const reportPath = "agent-artifacts/original/agent_005/source-task.md";
    const manifestPath = "agent-artifacts/original/agent_005/source-task.work-product.json";
    rmSync(workspaceRoot, { recursive: true, force: true });
    mkdirSync(path.join(workspaceRoot, "agent-artifacts", "original", "agent_005"), { recursive: true });
    writeFileSync(path.join(workspaceRoot, reportPath), "# Scoped responsibility report\n", "utf8");
    writeFileSync(path.join(workspaceRoot, manifestPath), JSON.stringify({
      format: "smartbuild-agent-work-product-v1", canonicalAgentId: "agent_005", agentKind: "original-canonical",
      buildScope: { buildRunId: "run-7", projectId: 5, conversationId: 6, taskId: "source-task" },
      actions: [{ kind: "responsibility-report", status: "completed" }], externalActions: "not-performed",
    }), "utf8");
    const execute = vi.fn();
    const persist = vi.fn();
    const result = await runOneProductionAgentTask({ ...input, workspaceRoot, tasks: [sourceTask] }, {
      claim: vi.fn().mockResolvedValue({ taskId: "source-task", agentId: "agent_005" }), complete: vi.fn().mockResolvedValue(true), execute, persist,
      executePython: vi.fn().mockResolvedValue({
        status: "succeeded", evidenceRefs: [], changedFiles: [reportPath, manifestPath], traceFile: "run-7-agent-005.jsonl",
        executionMetadata: { producedArtifactCount: 2, verificationCount: 1, nextActionCount: 0 },
      }),
    });
    expect(result).toMatchObject({ state: "failed", code: "PYTHON_AGENT_SOURCE_OUTPUT_INVALID" });
    expect(execute).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("fails the CSS writer rather than falling back when Python emits no stylesheet", async () => {
    const workspaceRoot = "/tmp/agent-worker-python-css-writer-without-source";
    const sourceTask = { ...input.tasks[0], taskId: "css-task", agentId: "agent_030", agentName: "Animation & CSS Master", allowedPathScopes: ["styles.css", "agent-artifacts/**"] };
    const reportPath = "agent-artifacts/original/agent_030/css-task.md";
    const manifestPath = "agent-artifacts/original/agent_030/css-task.work-product.json";
    rmSync(workspaceRoot, { recursive: true, force: true });
    mkdirSync(path.join(workspaceRoot, "agent-artifacts", "original", "agent_030"), { recursive: true });
    writeFileSync(path.join(workspaceRoot, reportPath), "# Scoped responsibility report\n", "utf8");
    writeFileSync(path.join(workspaceRoot, manifestPath), JSON.stringify({
      format: "smartbuild-agent-work-product-v1", canonicalAgentId: "agent_030", agentKind: "original-canonical",
      buildScope: { buildRunId: "run-7", projectId: 5, conversationId: 6, taskId: "css-task" },
      actions: [{ kind: "responsibility-report", status: "completed" }], externalActions: "not-performed",
    }), "utf8");
    const execute = vi.fn();
    const persist = vi.fn();
    const result = await runOneProductionAgentTask({ ...input, workspaceRoot, tasks: [sourceTask] }, {
      claim: vi.fn().mockResolvedValue({ taskId: "css-task", agentId: "agent_030" }), complete: vi.fn().mockResolvedValue(true), execute, persist,
      executePython: vi.fn().mockResolvedValue({
        status: "succeeded", evidenceRefs: [], changedFiles: [reportPath, manifestPath], traceFile: "run-7-agent-030.jsonl",
        executionMetadata: { producedArtifactCount: 2, verificationCount: 1, nextActionCount: 0 },
      }),
    });
    expect(result).toMatchObject({ state: "failed", code: "PYTHON_AGENT_SOURCE_OUTPUT_INVALID" });
    expect(execute).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it.each([
    ["agent_007", "Form & Validation Master", "form-task", "form-validation.js"],
    ["agent_065", "Tech Spec Writer", "docs-task", "README.md"],
  ])("fails %s rather than falling back when Python emits no durable source", async (agentId, agentName, taskId, expectedSourcePath) => {
    const workspaceRoot = `/tmp/agent-worker-python-${agentId}-without-source`;
    const sourceTask = { ...input.tasks[0], taskId, agentId, agentName, allowedPathScopes: [expectedSourcePath, "agent-artifacts/**"] };
    const reportPath = `agent-artifacts/original/${agentId}/${taskId}.md`;
    const manifestPath = `agent-artifacts/original/${agentId}/${taskId}.work-product.json`;
    rmSync(workspaceRoot, { recursive: true, force: true });
    mkdirSync(path.join(workspaceRoot, "agent-artifacts", "original", agentId), { recursive: true });
    writeFileSync(path.join(workspaceRoot, reportPath), "# Scoped responsibility report\n", "utf8");
    writeFileSync(path.join(workspaceRoot, manifestPath), JSON.stringify({
      format: "smartbuild-agent-work-product-v1", canonicalAgentId: agentId, agentKind: "original-canonical",
      buildScope: { buildRunId: "run-7", projectId: 5, conversationId: 6, taskId },
      actions: [{ kind: "responsibility-report", status: "completed" }], externalActions: "not-performed",
    }), "utf8");
    const execute = vi.fn();
    const persist = vi.fn();
    const result = await runOneProductionAgentTask({ ...input, workspaceRoot, tasks: [sourceTask] }, {
      claim: vi.fn().mockResolvedValue({ taskId, agentId }), complete: vi.fn().mockResolvedValue(true), execute, persist,
      executePython: vi.fn().mockResolvedValue({
        status: "succeeded", evidenceRefs: [], changedFiles: [reportPath, manifestPath], traceFile: `run-7-${agentId}.jsonl`,
        executionMetadata: { producedArtifactCount: 2, verificationCount: 1, nextActionCount: 0 },
      }),
    });
    expect(result).toMatchObject({ state: "failed", code: "PYTHON_AGENT_SOURCE_OUTPUT_INVALID" });
    expect(execute).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it.each([
    ["a path outside the selected source scope", "styles.css", "body{}", ["index.html"], "PYTHON_AGENT_ARTIFACT_SCOPE_INVALID"],
    ["a secret-like source value", "index.html", "const key = 'sk_1234567890abcdefghijklmnop';", ["project/**"], "PYTHON_AGENT_ARTIFACT_CONTAINS_SECRET_PATTERN"],
  ])("fails before persistence when Python returns %s", async (_label, sourcePath, content, allowedPathScopes, expectedCode) => {
    const workspaceRoot = `/tmp/agent-worker-python-source-invalid-${Math.random().toString(16).slice(2)}`;
    rmSync(workspaceRoot, { recursive: true, force: true });
    mkdirSync(workspaceRoot, { recursive: true });
    writeFileSync(path.join(workspaceRoot, sourcePath), content, "utf8");
    const persist = vi.fn();
    const result = await runOneProductionAgentTask({ ...input, workspaceRoot, tasks: [{ ...input.tasks[0], allowedPathScopes }] }, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }), complete: vi.fn().mockResolvedValue(true), persist,
      execute: vi.fn(),
      executePython: vi.fn().mockResolvedValue({ status: "succeeded", evidenceRefs: [], changedFiles: [sourcePath], traceFile: "run-7.jsonl", executionMetadata: { producedArtifactCount: 1, verificationCount: 0, nextActionCount: 0 } }),
    });
    expect(result).toMatchObject({ state: "failed", code: expectedCode });
    expect(persist).not.toHaveBeenCalled();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("fails before persistence when an additive work-product manifest has no paired scoped report", async () => {
    const workspaceRoot = "/tmp/agent-worker-python-invalid-manifest";
    rmSync(workspaceRoot, { recursive: true, force: true });
    const manifestPath = "agent-artifacts/pr-001/task-1.work-product.json";
    mkdirSync(path.join(workspaceRoot, "agent-artifacts", "pr-001"), { recursive: true });
    writeFileSync(path.join(workspaceRoot, manifestPath), JSON.stringify({
      format: "smartbuild-agent-work-product-v1", canonicalAgentId: "agent_071",
      buildScope: { buildRunId: "run-7", projectId: 5, conversationId: 6, taskId: "task-1" }, actions: [additiveAction], externalActions: "not-performed",
    }), "utf8");
    const persist = vi.fn();
    const result = await runOneProductionAgentTask({ ...input, workspaceRoot }, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }),
      complete: vi.fn().mockResolvedValue(true), persist,
      executePython: vi.fn().mockResolvedValue({ status: "succeeded", evidenceRefs: [], changedFiles: [manifestPath], traceFile: "run-7.jsonl", executionMetadata: { producedArtifactCount: 1, verificationCount: 0, nextActionCount: 0 } }),
      execute: vi.fn().mockResolvedValue({ status: "succeeded", summary: "done", changedFiles: [], verification: [], evidenceRefs: [] }),
    });
    expect(result).toMatchObject({ state: "failed", code: "PYTHON_AGENT_WORK_PRODUCT_INVALID" });
    expect(persist).not.toHaveBeenCalled();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("persists a validated original responsibility report and manifest together", async () => {
    const workspaceRoot = "/tmp/agent-worker-original-success";
    rmSync(workspaceRoot, { recursive: true, force: true });
    writeOriginalWorkProducts(workspaceRoot, originalManifest());
    const persist = vi.fn().mockImplementation(async (_workerInput, files) => files.map((file: { path: string }) => file.path));
    const result = await runOneProductionAgentTask({ ...originalInput, workspaceRoot }, {
      claim: vi.fn().mockResolvedValue({ taskId: "original-task", agentId: "agent_003" }), complete: vi.fn().mockResolvedValue(true), persist,
      executePython: vi.fn().mockResolvedValue({ status: "succeeded", evidenceRefs: [], changedFiles: [originalReportPath, originalManifestPath], traceFile: "run-7.jsonl", executionMetadata: { producedArtifactCount: 2, verificationCount: 1, nextActionCount: 1 } }),
      execute: vi.fn().mockResolvedValue({ status: "succeeded", summary: "done", changedFiles: [{ path: "index.html", content: "<main />" }], verification: [], evidenceRefs: [] }),
      persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/original-task.json"]),
    });
    expect(result).toMatchObject({ state: "succeeded", artifactRefs: [originalReportPath, originalManifestPath] });
    expect(persist).toHaveBeenCalledTimes(1);
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it.each([
    ["the report is absent", (root: string) => writeOriginalWorkProducts(root, originalManifest(), false), [originalManifestPath]],
    ["the tuple does not match", (root: string) => writeOriginalWorkProducts(root, originalManifest({ buildScope: { buildRunId: "foreign-run" } })), [originalReportPath, originalManifestPath]],
    ["the agent identity does not match", (root: string) => writeOriginalWorkProducts(root, originalManifest({ canonicalAgentId: "agent_004" })), [originalReportPath, originalManifestPath]],
    ["the action is not an original responsibility report", (root: string) => writeOriginalWorkProducts(root, originalManifest({ actions: [{ kind: "other", status: "completed" }] })), [originalReportPath, originalManifestPath]],
    ["external actions are claimed", (root: string) => writeOriginalWorkProducts(root, originalManifest({ externalActions: "performed" })), [originalReportPath, originalManifestPath]],
  ])("fails before persistence when %s", async (_label, writeArtifacts, changedFiles) => {
    const workspaceRoot = `/tmp/agent-worker-original-invalid-${Math.random().toString(16).slice(2)}`;
    rmSync(workspaceRoot, { recursive: true, force: true });
    writeArtifacts(workspaceRoot);
    const persist = vi.fn();
    const result = await runOneProductionAgentTask({ ...originalInput, workspaceRoot }, {
      claim: vi.fn().mockResolvedValue({ taskId: "original-task", agentId: "agent_003" }), complete: vi.fn().mockResolvedValue(true), persist,
      executePython: vi.fn().mockResolvedValue({ status: "succeeded", evidenceRefs: [], changedFiles, traceFile: "run-7.jsonl", executionMetadata: { producedArtifactCount: changedFiles.length, verificationCount: 0, nextActionCount: 0 } }),
      execute: vi.fn().mockResolvedValue({ status: "succeeded", summary: "done", changedFiles: [], verification: [], evidenceRefs: [] }),
    });
    expect(result).toMatchObject({ state: "failed", code: "PYTHON_AGENT_WORK_PRODUCT_INVALID" });
    expect(persist).not.toHaveBeenCalled();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("persists a Python blocker without writing model artifacts", async () => {
    const persist = vi.fn();
    const result = await runOneProductionAgentTask(input, {
      claim: vi.fn().mockResolvedValue({ taskId: "task-1", agentId: "agent_071" }), complete: vi.fn().mockResolvedValue(true), persist,
      execute: vi.fn().mockResolvedValue({ status: "succeeded", summary: "needs reservation", changedFiles: [{ path: "index.html", content: "x" }], verification: [{ name: "scope", result: "pass", detail: "ok" }], evidenceRefs: [] }),
      executePython: vi.fn().mockResolvedValue({ status: "blocked", evidenceRefs: ["evidence/agent-executions/task-1.json#sha256:def"], changedFiles: [], traceFile: "run-7.jsonl", blockedReason: "EXTERNAL_PROVIDER_NOT_CONFIGURED", executionMetadata: { producedArtifactCount: 0, verificationCount: 1, nextActionCount: 0 } }),
      persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/task-1.json"]),
    });
    expect(result).toMatchObject({ state: "blocked", reason: "EXTERNAL_PROVIDER_NOT_CONFIGURED" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("keeps a typed original Python blocker artifact-free", async () => {
    const persist = vi.fn();
    const result = await runOneProductionAgentTask(originalInput, {
      claim: vi.fn().mockResolvedValue({ taskId: "original-task", agentId: "agent_003" }), complete: vi.fn().mockResolvedValue(true), persist,
      execute: vi.fn(),
      executePython: vi.fn().mockResolvedValue({ status: "blocked", evidenceRefs: [], changedFiles: [], traceFile: "run-7.jsonl", blockedReason: "INTEGRATION_NOT_CONFIGURED", executionMetadata: { producedArtifactCount: 0, verificationCount: 1, nextActionCount: 0 } }),
      persistEvidence: vi.fn().mockResolvedValue(["evidence/agent-executions/original-task.json"]),
    });
    expect(result).toMatchObject({ state: "blocked", reason: "INTEGRATION_NOT_CONFIGURED" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("blocks an unknown durable task instead of running a different agent", async () => {
    const execute = vi.fn();
    const complete = vi.fn().mockResolvedValue(true);
    const result = await runOneProductionAgentTask(input, {
      claim: vi.fn().mockResolvedValue({ taskId: "foreign-task", agentId: "foreign-agent" }), complete, execute,
    });
    expect(result).toMatchObject({ state: "blocked", reason: "AGENT_DEFINITION_NOT_FOUND" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does nothing when no sequential task is eligible", async () => {
    await expect(runOneProductionAgentTask(input, { claim: vi.fn().mockResolvedValue(undefined) })).resolves.toEqual({ state: "idle" });
  });
});
