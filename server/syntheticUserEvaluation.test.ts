import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { runSyntheticUserEvaluation } from "./syntheticUserEvaluation";

const previousPython = process.env.SMARTBUILD_PYTHON_EXECUTABLE;
const previousNodeEnv = process.env.NODE_ENV;
const previousChromiumPath = process.env.CHROMIUM_PATH;
const previousChromiumLaunchTimeout = process.env.SMARTBUILD_CHROMIUM_LAUNCH_TIMEOUT_MS;
const previousEvaluatorEngine = process.env.SMARTBUILD_SYNTHETIC_EVALUATOR_ENGINE;
const cleanupRoots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  if (previousPython === undefined) delete process.env.SMARTBUILD_PYTHON_EXECUTABLE;
  else process.env.SMARTBUILD_PYTHON_EXECUTABLE = previousPython;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousChromiumPath === undefined) delete process.env.CHROMIUM_PATH;
  else process.env.CHROMIUM_PATH = previousChromiumPath;
  if (previousChromiumLaunchTimeout === undefined) delete process.env.SMARTBUILD_CHROMIUM_LAUNCH_TIMEOUT_MS;
  else process.env.SMARTBUILD_CHROMIUM_LAUNCH_TIMEOUT_MS = previousChromiumLaunchTimeout;
  if (previousEvaluatorEngine === undefined) delete process.env.SMARTBUILD_SYNTHETIC_EVALUATOR_ENGINE;
  else process.env.SMARTBUILD_SYNTHETIC_EVALUATOR_ENGINE = previousEvaluatorEngine;
  await Promise.all(cleanupRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

describe("synthetic evaluator runtime failures", () => {
  it("writes a bounded unavailable runtime diagnostic and never returns stale evaluator evidence", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "smartbuild-evaluator-runtime-"));
    cleanupRoots.push(workspaceRoot);
    const evidenceRoot = path.join(workspaceRoot, "evidence", "evaluators");
    await mkdir(evidenceRoot, { recursive: true });
    await writeFile(path.join(evidenceRoot, "synthetic-evaluation.json"), JSON.stringify({ stale: true }));
    process.env.SMARTBUILD_PYTHON_EXECUTABLE = "/definitely-not-a-smartbuild-python";

    await expect(runSyntheticUserEvaluation({
      buildRunId: "runtime-failure-101",
      workspaceRoot,
      previewUrl: "http://127.0.0.1:1",
      template: "saas",
      acceptanceCriteria: [],
      requiredPythonModules: ["module_that_does_not_exist"],
    })).rejects.toThrow("SYNTHETIC_EVALUATOR_RUNTIME_UNAVAILABLE");

    await expect(readFile(path.join(evidenceRoot, "synthetic-evaluation.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    const diagnostic = JSON.parse(await readFile(path.join(evidenceRoot, "python-runtime-diagnostic.json"), "utf8"));
    expect(diagnostic).toMatchObject({ component: "synthetic-evaluator", status: "unavailable", resolvedExecutable: null });
    expect(JSON.stringify(diagnostic)).not.toMatch(/token|authorization|api[_-]?key|password/i);
  });

  it("ends a non-returning evaluator subprocess with fresh terminal evidence", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "smartbuild-evaluator-timeout-"));
    cleanupRoots.push(workspaceRoot);
    process.env.SMARTBUILD_PYTHON_EXECUTABLE = "python3";
    process.env.NODE_ENV = "test";

    await expect(runSyntheticUserEvaluation({
      buildRunId: "timeout-101",
      workspaceRoot,
      previewUrl: "http://127.0.0.1:1",
      template: "saas",
      acceptanceCriteria: [],
      evaluatorTimeoutMs: 100,
      testDelayMs: 500,
    })).rejects.toThrow("SYNTHETIC_EVALUATOR_TIMEOUT");

    const evidenceRoot = path.join(workspaceRoot, "evidence", "evaluators");
    const terminal = JSON.parse(await readFile(path.join(evidenceRoot, "evaluator-terminal.json"), "utf8"));
    expect(terminal).toMatchObject({ code: "SYNTHETIC_EVALUATOR_TIMEOUT", status: "FAILED" });
    await expect(readFile(path.join(evidenceRoot, "synthetic-evaluation.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  }, 10_000);

  it("persists a redacted terminal startup diagnostic when Chromium cannot launch", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "smartbuild-evaluator-browser-startup-"));
    cleanupRoots.push(workspaceRoot);
    process.env.SMARTBUILD_PYTHON_EXECUTABLE = "python3";
    process.env.CHROMIUM_PATH = "/definitely-not-a-smartbuild-chromium";
    process.env.SMARTBUILD_CHROMIUM_LAUNCH_TIMEOUT_MS = "1000";

    const result = await runSyntheticUserEvaluation({
      buildRunId: "browser-startup-failure-101",
      workspaceRoot,
      previewUrl: "http://127.0.0.1:1",
      template: "saas",
      acceptanceCriteria: [],
    });

    expect(result).toMatchObject({ final_status: "BLOCKED", checkpoint_allowed: false });
    expect(result.runs).toEqual([
      expect.objectContaining({ evaluator_instance: "functional_synthetic_user", status: "FAILED", current_step: "runner-startup" }),
      expect.objectContaining({ evaluator_instance: "visual_synthetic_user", status: "SKIPPED", skip_reason: "functional_evaluator_failed" }),
    ]);
    const startup = await readFile(path.join(workspaceRoot, "evidence", "evaluators", "browser-runner-startup.json"), "utf8");
    const terminal = await readFile(path.join(workspaceRoot, "evidence", "evaluators", "evaluator-runner-error.json"), "utf8");
    expect(startup).toContain("SYNTHETIC_BROWSER_RUNNER_STARTUP_FAILED");
    expect(terminal).toContain("SYNTHETIC_BROWSER_RUNNER_STARTUP_FAILED");
    expect(`${startup}${terminal}`).not.toContain("/definitely-not-a-smartbuild-chromium");
  }, 15_000);

  it("records evidence-backed functional and visual defects from a controlled preview in serial order", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "smartbuild-evaluator-defects-"));
    cleanupRoots.push(workspaceRoot);
    process.env.SMARTBUILD_PYTHON_EXECUTABLE = "python3";
    const document = `<!doctype html><html><head><style>body{background:#111;color:#fff;margin:0}.overflow{width:900px;height:24px}button{min-height:32px}</style></head><body><a href="#">Broken primary action</a><div class="overflow">mobile overflow</div><form id="contact-form"><input id="name"><input id="email"><textarea id="message"></textarea><span data-error-for="name" hidden>Required</span><button type="submit">Send</button><p id="form-status"></p></form><script>document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); const valid = document.querySelector('#name').value && document.querySelector('#email').value && document.querySelector('#message').value; document.querySelector('[data-error-for="name"]').hidden = Boolean(valid); document.querySelector('#form-status').textContent = valid ? 'Message received' : ''; });</script></body></html>`;
    const server = createServer((_, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(document);
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_UNAVAILABLE");

    const result = await runSyntheticUserEvaluation({
      buildRunId: "controlled-defects-101",
      workspaceRoot,
      previewUrl: `http://127.0.0.1:${address.port}`,
      template: "contact-form",
      acceptanceCriteria: [{ id: "form", title: "contact form validation" }],
    });

    expect(result.runs.map(run => run.evaluator_instance)).toEqual(["functional_synthetic_user", "visual_synthetic_user"]);
    expect(result.checkpoint_allowed).toBe(false);
    expect(result.bugs).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Required link has a fake href target", severity: "high", status: "REPAIR_PLANNED" }),
      expect.objectContaining({ title: "Form shows success without a successful backend request", severity: "critical", status: "REPAIR_PLANNED" }),
      expect.objectContaining({ title: "Horizontal overflow at responsive viewport", severity: "high", status: "REPAIR_PLANNED" }),
    ]));
    await expect(readFile(path.join(workspaceRoot, "evidence", "evaluators", "functional-findings.json"), "utf8")).resolves.toContain("fake href");
    await expect(readFile(path.join(workspaceRoot, "evidence", "evaluators", "visual-mobile.png"))).resolves.toBeInstanceOf(Buffer);
  }, 90_000);

  it("uses the bounded production evaluator to persist actual preview evidence without launching Chromium", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "smartbuild-evaluator-lightweight-"));
    cleanupRoots.push(workspaceRoot);
    process.env.SMARTBUILD_PYTHON_EXECUTABLE = "python3";
    process.env.SMARTBUILD_SYNTHETIC_EVALUATOR_ENGINE = "lightweight";
    process.env.CHROMIUM_PATH = "/intentionally-unavailable-chromium";
    const document = `<!doctype html><html><head><style>body{background:#111;color:#fff}.overflow{width:900px}</style></head><body><a href="#">Broken primary action</a><form id="contact-form"><input id="name"><input id="email"><textarea id="message"></textarea><span data-error-for="name">Required</span><button type="submit">Send</button><p id="form-status">Message received</p></form></body></html>`;
    const server = createServer((_, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(document);
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_UNAVAILABLE");
    const input = { buildRunId: "lightweight-101", workspaceRoot, previewUrl: `http://127.0.0.1:${address.port}`, template: "contact-form", acceptanceCriteria: [{ id: "form", title: "contact form validation" }] };

    const functional = await runSyntheticUserEvaluation({ ...input, evaluator: "functional_synthetic_user" });
    const visual = await runSyntheticUserEvaluation({ ...input, evaluator: "visual_synthetic_user" });

    expect(functional.runs).toEqual([expect.objectContaining({ evaluator_instance: "functional_synthetic_user", status: "FAILED" })]);
    expect(visual.runs).toEqual([expect.objectContaining({ evaluator_instance: "visual_synthetic_user", status: "FAILED" })]);
    await expect(readFile(path.join(workspaceRoot, "evidence", "evaluators", "functional-trace.json"), "utf8")).resolves.toContain('"engine": "lightweight"');
    await expect(readFile(path.join(workspaceRoot, "evidence", "evaluators", "visual-trace.json"), "utf8")).resolves.toContain('"engine": "lightweight"');
    expect([...functional.bugs, ...visual.bugs]).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Required link has a fake href target", severity: "high" }),
      expect.objectContaining({ title: "Form shows success without a successful backend request", severity: "critical" }),
      expect.objectContaining({ title: "Horizontal overflow at responsive viewport", severity: "high" }),
    ]));
  }, 20_000);

  it("runs functional and visual evaluation in separate persisted invocations", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "smartbuild-evaluator-phases-"));
    cleanupRoots.push(workspaceRoot);
    process.env.SMARTBUILD_PYTHON_EXECUTABLE = "python3";
    const server = createServer((_, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<!doctype html><html><head><style>body{margin:0;background:#111;color:#fff}a{display:inline-block;min-height:32px}</style></head><body><a href="#overview">Overview</a><main id="overview">Ready</main></body></html>`);
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_UNAVAILABLE");
    const input = { buildRunId: "phased-101", workspaceRoot, previewUrl: `http://127.0.0.1:${address.port}`, template: "saas", acceptanceCriteria: [] };

    const functional = await runSyntheticUserEvaluation({ ...input, evaluator: "functional_synthetic_user" });
    expect(functional.runs).toEqual([expect.objectContaining({ evaluator_instance: "functional_synthetic_user", status: "PASS" })]);
    await expect(readFile(path.join(workspaceRoot, "evidence", "evaluators", "functional-findings.json"), "utf8")).resolves.toContain("functional_synthetic_user");

    const visual = await runSyntheticUserEvaluation({ ...input, evaluator: "visual_synthetic_user" });
    expect(visual.runs).toEqual([expect.objectContaining({ evaluator_instance: "visual_synthetic_user", status: "PASS" })]);
    await expect(readFile(path.join(workspaceRoot, "evidence", "evaluators", "functional-findings.json"), "utf8")).resolves.toContain("functional_synthetic_user");
    await expect(readFile(path.join(workspaceRoot, "evidence", "evaluators", "visual-findings.json"), "utf8")).resolves.toContain("visual_synthetic_user");
  }, 90_000);
});
