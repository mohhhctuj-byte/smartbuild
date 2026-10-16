import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { pythonRuntimeEnvironment, resolvePythonRuntime } from "./pythonRuntime";

export type PythonAgentBridgeRequest = {
  workspaceRoot: string;
  assignment: {
    agentId: string;
    taskKind: string;
    reason: string;
    paths?: string[];
  };
  prompt: string;
  userGoal?: string;
  requestedFeatures?: string[];
  system?: string;
};

export type PythonAgentBridgeResponse = {
  ok: boolean;
  error?: string;
  providerStatus?: string;
  runId?: string;
  agentId?: string;
  result?: string;
  specialist?: {
    agent_id: string;
    name: string;
    team: string;
    capabilities: string[];
    required_tools: string[];
    required_permissions: string[];
    dependencies: string[];
    high_risk: boolean;
  };
  events?: unknown[];
  protocol?: {
    contractId: string;
    verification: unknown;
    status: {
      verified: string[];
      blocked: string[];
      assumptions: string[];
      confidence: "high" | "medium" | "low";
      evidence_count: number;
      private_reasoning_included: false;
    };
  };
};

export function agentRuntimeEventPayload(result: PythonAgentBridgeResponse, assignment: PythonAgentBridgeRequest["assignment"]) {
  return {
    agentId: assignment.agentId,
    taskKind: assignment.taskKind,
    runId: result.runId,
    paths: (assignment.paths ?? []).slice(0, 50),
    specialist: result.specialist ?? null,
    provider: "manus" as const,
    byok: "BLOCKED" as const,
    protocol: result.protocol ?? null,
  };
}

export function pythonRuntimeStatus() {
  return {
    enabled: process.env.VEYRA_PYTHON_RUNTIME_ENABLED !== "0",
    mode: "cloud-workspace" as const,
    provider: "manus" as const,
    byok: "BLOCKED" as const,
  };
}

export async function runPythonAgent(request: PythonAgentBridgeRequest): Promise<PythonAgentBridgeResponse> {
  if (process.env.VEYRA_PYTHON_RUNTIME_ENABLED === "0") {
    return { ok: false, error: "PYTHON_RUNTIME_DISABLED_BY_SERVER" };
  }
  if (!path.isAbsolute(request.workspaceRoot)) {
    return { ok: false, error: "WORKSPACE_ROOT_MUST_BE_ABSOLUTE" };
  }
  const cliPath = path.resolve(process.cwd(), "agent_runtime", "cli.py");
  try {
    await access(cliPath);
  } catch {
    return { ok: false, error: "PYTHON_RUNTIME_NOT_INSTALLED" };
  }

  let python: string;
  try {
    python = (await resolvePythonRuntime({ component: "interactive-agent-runtime", workingDirectory: process.cwd() })).executable;
  } catch {
    return { ok: false, error: "PYTHON_RUNTIME_UNAVAILABLE" };
  }
  return await new Promise(resolve => {
    const child = spawn(python, [cliPath], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"], env: pythonRuntimeEnvironment() });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value: PythonAgentBridgeResponse) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    child.stdout.on("data", chunk => { stdout += String(chunk); });
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    child.on("error", error => finish({ ok: false, error: `PYTHON_RUNTIME_START_FAILED:${error.message}` }));
    child.on("close", code => {
      if (code !== 0) {
        finish({ ok: false, error: `PYTHON_RUNTIME_EXITED:${code}:${stderr.slice(0, 240)}` });
        return;
      }
      try {
        finish(JSON.parse(stdout.trim()) as PythonAgentBridgeResponse);
      } catch {
        finish({ ok: false, error: "PYTHON_RUNTIME_INVALID_RESPONSE" });
      }
    });
    child.stdin.write(`${JSON.stringify({ type: "run_agent", ...request })}\n`);
    child.stdin.end();
  });
}
