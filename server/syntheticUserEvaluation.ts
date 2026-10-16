import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { PythonRuntimeResolutionError, type PythonRuntimeDiagnostic, pythonRuntimeEnvironment, resolvePythonRuntime } from "./pythonRuntime";

export type SyntheticBugSeverity = "critical" | "high" | "medium" | "low" | "unconfirmed";
export type SyntheticBugStatus = "NEW" | "TRIAGED" | "REPAIR_PLANNED" | "FIXED" | "WONT_FIX" | "DUPLICATE" | "UNCONFIRMED" | "BLOCKED";
export type SyntheticBugReport = {
  bug_id: string; evaluator_instance: "functional_synthetic_user" | "visual_synthetic_user"; category: string; title: string; severity: SyntheticBugSeverity; confidence: number;
  route?: string | null; reproducible: boolean; steps_to_reproduce: string[]; expected_result: string; actual_result: string; suspected_owner_agent?: string | null;
  selector_or_target?: string | null; evidence_paths: string[]; console_errors: string[]; network_failures: string[]; screenshot_paths: string[]; trace_path?: string | null; status: SyntheticBugStatus;
};
export type SyntheticEvaluationSummary = {
  enabled: true; execution_policy: "sequential"; max_concurrency: 1; functional_user_first: true; visual_user_second: true; run_after_implementation: true; run_before_verification: true;
  rerun_after_repair: true; max_repair_cycles: 3; require_evidence_for_bug: true; block_checkpoint_on_critical_or_high: true; allow_unapproved_external_side_effects: false;
  runs: Array<{ evaluator_instance: "functional_synthetic_user" | "visual_synthetic_user"; status: "PASS" | "FAILED" | "SKIPPED"; started_at: string; completed_at: string; current_route?: string | null; current_step?: string | null; actions: Array<{ route?: string; step?: string; passed?: boolean }>; evidence_paths: string[]; screenshot_paths: string[]; trace_path?: string | null; console_errors: string[]; network_failures: string[]; skip_reason?: string | null }>;
  bugs: SyntheticBugReport[];
  repair_tasks: Array<{ task_id: string; task_graph_node_id: string; bug_id: string; agent_id: string; agent_name: string; depends_on: string[]; execution_policy: "sequential"; resource_locks: string[]; status: "REPAIR_PLANNED" | "FIXED" | "BLOCKED"; reason: string }>;
  repair_cycles: number; checkpoint_allowed: boolean; final_status: "PASS" | "FAILED" | "BLOCKED"; output_path: "evidence/evaluators/synthetic-evaluation.json";
  runtime_diagnostic?: PythonRuntimeDiagnostic;
};

function lastJsonLine(value: string) {
  const line = value.trim().split(/\r?\n/).reverse().find(item => item.trim());
  if (!line) throw new Error("SYNTHETIC_EVALUATOR_EMPTY_OUTPUT");
  return JSON.parse(line) as { ok?: boolean; error?: string; evaluation?: unknown };
}

function safeDetail(value: unknown) {
  return String(value || "SYNTHETIC_EVALUATOR_FAILED").replace(/(?:token|authorization|api[_-]?key|password)\s*[:=]\s*\S+/gi, "$1=[REDACTED]").slice(0, 700);
}

async function runEvaluatorProcess(executable: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }) {
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, { cwd: options.cwd, env: pythonRuntimeEnvironment(options.env), detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      try {
        if (child.pid) process.kill(process.platform !== "win32" ? -child.pid : child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      settle(() => reject(Object.assign(new Error("SYNTHETIC_EVALUATOR_TIMEOUT"), { code: "ETIMEDOUT", killed: true, stdout, stderr })));
    }, options.timeoutMs);
    child.stdout?.on("data", chunk => { stdout += String(chunk); });
    child.stderr?.on("data", chunk => { stderr += String(chunk); });
    child.on("error", error => settle(() => reject(Object.assign(error, { stdout, stderr }))));
    child.on("close", code => {
      if (code === 0) settle(() => resolve({ stdout, stderr }));
      else settle(() => reject(Object.assign(new Error(stderr || `SYNTHETIC_EVALUATOR_EXIT_${code}`), { code, stdout, stderr })));
    });
  });
}

function isEvidencePath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("evidence/") && !value.includes("..") && !value.includes("\\");
}

function validateEvaluation(value: unknown): SyntheticEvaluationSummary {
  const evaluation = value as Partial<SyntheticEvaluationSummary> | null;
  if (!evaluation || evaluation.enabled !== true || evaluation.execution_policy !== "sequential" || evaluation.max_concurrency !== 1 || evaluation.max_repair_cycles !== 3 || !Array.isArray(evaluation.runs) || !Array.isArray(evaluation.bugs) || !Array.isArray(evaluation.repair_tasks) || typeof evaluation.checkpoint_allowed !== "boolean" || !["PASS", "FAILED", "BLOCKED"].includes(String(evaluation.final_status))) throw new Error("SYNTHETIC_EVALUATOR_SCHEMA_INVALID");
  for (const run of evaluation.runs) {
    if (!run || !["functional_synthetic_user", "visual_synthetic_user"].includes(String(run.evaluator_instance)) || !["PASS", "FAILED", "SKIPPED"].includes(String(run.status)) || !Array.isArray(run.evidence_paths) || !run.evidence_paths.every(isEvidencePath)) throw new Error("SYNTHETIC_EVALUATOR_RUN_INVALID");
  }
  for (const bug of evaluation.bugs) {
    if (!bug || !["critical", "high", "medium", "low", "unconfirmed"].includes(String(bug.severity)) || !["NEW", "TRIAGED", "REPAIR_PLANNED", "FIXED", "WONT_FIX", "DUPLICATE", "UNCONFIRMED", "BLOCKED"].includes(String(bug.status)) || !Array.isArray(bug.evidence_paths) || !bug.evidence_paths.every(isEvidencePath)) throw new Error("SYNTHETIC_EVALUATOR_BUG_INVALID");
  }
  for (const task of evaluation.repair_tasks) {
    if (!task || !/^taskgraph:repair:bug-/.test(String(task.task_graph_node_id)) || !/^agent_\d{3}$/.test(String(task.agent_id)) || task.execution_policy !== "sequential" || !Array.isArray(task.depends_on) || !task.depends_on.every(item => /^evaluator-evidence:bug-/.test(String(item))) || !Array.isArray(task.resource_locks) || !task.resource_locks.includes("project-write")) throw new Error("SYNTHETIC_EVALUATOR_REPAIR_TASK_INVALID");
  }
  return evaluation as SyntheticEvaluationSummary;
}

export async function runSyntheticUserEvaluation(input: { buildRunId: string; workspaceRoot: string; previewUrl: string; backendUrl?: string; testToken?: string; template: string; acceptanceCriteria: Array<{ id: string; title: string }>; evaluator?: "functional_synthetic_user" | "visual_synthetic_user"; resetEvidence?: boolean; requiredPythonModules?: string[]; evaluatorTimeoutMs?: number; testDelayMs?: number }) {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const runtimeRoot = path.join(workspaceRoot, ".smartbuild-runtime");
  const evidenceRoot = path.join(workspaceRoot, "evidence", "evaluators");
  await mkdir(runtimeRoot, { recursive: true });
  const resetEvidence = input.resetEvidence ?? input.evaluator !== "visual_synthetic_user";
  if (resetEvidence) await rm(evidenceRoot, { recursive: true, force: true });
  await mkdir(evidenceRoot, { recursive: true });
  const activeEvaluator = input.evaluator || "functional_synthetic_user";
  await writeFile(path.join(evidenceRoot, "progress.json"), JSON.stringify({ state: "running", activeEvaluator, updatedAt: new Date().toISOString(), detail: activeEvaluator === "functional_synthetic_user" ? "Functional synthetic user is running; visual synthetic user remains queued." : "Functional synthetic user completed; visual synthetic user is running." }, null, 2), { encoding: "utf8", mode: 0o600 });
  const inputPath = path.join(runtimeRoot, "synthetic-evaluator-input.json");
  await writeFile(inputPath, JSON.stringify({ run_id: input.buildRunId, workspace_root: workspaceRoot, evidence_root: evidenceRoot, preview_url: input.previewUrl, backend_url: input.backendUrl, test_token: input.testToken, template: input.template, acceptance_criteria: input.acceptanceCriteria, evaluator: input.evaluator }, null, 2), { encoding: "utf8", mode: 0o600 });
  const runtimeDiagnosticPath = path.join(evidenceRoot, "python-runtime-diagnostic.json");
  const configuredTimeout = Number(process.env.SMARTBUILD_SYNTHETIC_EVALUATOR_TIMEOUT_MS);
  const defaultTimeout = Number.isFinite(configuredTimeout) ? configuredTimeout : 120_000;
  const evaluatorTimeoutMs = Math.min(Math.max(input.evaluatorTimeoutMs ?? defaultTimeout, 100), 180_000);
  const evaluatorEnv: NodeJS.ProcessEnv = { ...process.env, PYTHONDONTWRITEBYTECODE: "1" };
  if (process.env.NODE_ENV === "test" && Number.isFinite(input.testDelayMs) && (input.testDelayMs || 0) > 0) evaluatorEnv.SMARTBUILD_SYNTHETIC_EVALUATOR_TEST_DELAY_MS = String(Math.min(input.testDelayMs || 0, 2_000));
  try {
    const runtime = await resolvePythonRuntime({ component: "synthetic-evaluator", workingDirectory: process.cwd(), requiredModules: input.requiredPythonModules });
    await writeFile(runtimeDiagnosticPath, JSON.stringify(runtime.diagnostic, null, 2), { encoding: "utf8", mode: 0o600 });
    const result = await runEvaluatorProcess(runtime.executable, ["-m", "server.agents.synthetic_evaluators", "--input", inputPath], { cwd: process.cwd(), env: evaluatorEnv, timeoutMs: evaluatorTimeoutMs });
    const parsed = lastJsonLine(result.stdout);
    if (!parsed.ok) throw new Error(`SYNTHETIC_EVALUATOR_FAILED: ${safeDetail(parsed.error)}`);
    const evaluation = validateEvaluation(parsed.evaluation);
    const persisted = JSON.parse(await readFile(path.join(evidenceRoot, "synthetic-evaluation.json"), "utf8"));
    validateEvaluation(persisted);
    return { ...evaluation, runtime_diagnostic: runtime.diagnostic };
  } catch (error) {
    if (error instanceof PythonRuntimeResolutionError) {
      await writeFile(runtimeDiagnosticPath, JSON.stringify(error.diagnostic, null, 2), { encoding: "utf8", mode: 0o600 });
      throw new Error("SYNTHETIC_EVALUATOR_RUNTIME_UNAVAILABLE");
    }
    const detail = error as NodeJS.ErrnoException & { killed?: boolean; code?: string | number; stdout?: string; stderr?: string };
    const code = detail.killed || detail.code === "ETIMEDOUT" ? "SYNTHETIC_EVALUATOR_TIMEOUT" : "SYNTHETIC_EVALUATOR_FAILED";
    await writeFile(path.join(evidenceRoot, "evaluator-terminal.json"), JSON.stringify({ code, status: "FAILED", completedAt: new Date().toISOString() }, null, 2), { encoding: "utf8", mode: 0o600 });
    throw new Error(`${code}: ${safeDetail(detail.stderr || detail.stdout || detail.message)}`);
  }
}
