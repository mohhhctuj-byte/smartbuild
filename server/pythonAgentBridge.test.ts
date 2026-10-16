import { afterEach, describe, expect, it } from "vitest";
import { agentRuntimeEventPayload, pythonRuntimeStatus, runPythonAgent } from "./pythonAgentBridge";

const previousEnabled = process.env.VEYRA_PYTHON_RUNTIME_ENABLED;

afterEach(() => {
  if (previousEnabled === undefined) delete process.env.VEYRA_PYTHON_RUNTIME_ENABLED;
  else process.env.VEYRA_PYTHON_RUNTIME_ENABLED = previousEnabled;
});

describe("python agent bridge", () => {
  it("reports Manus as the provider and keeps BYOK blocked", () => {
    expect(pythonRuntimeStatus()).toEqual({
      enabled: true,
      mode: "cloud-workspace",
      provider: "manus",
      byok: "BLOCKED",
    });
  });

  it("maps specialist contract evidence into the Task Graph event payload", () => {
    const payload = agentRuntimeEventPayload({
      ok: true,
      runId: "run-1",
      protocol: {
        contractId: "req-1",
        verification: { status: "verified" },
        status: { verified: ["bounded evidence"], blocked: [], assumptions: [], confidence: "high", evidence_count: 1, private_reasoning_included: false },
      },
      specialist: {
        agent_id: "user_clarifier",
        name: "User Clarifier Agent",
        team: "planning",
        capabilities: ["planning", "supervisor-gated"],
        required_tools: ["workspace.read"],
        required_permissions: ["read-workspace"],
        dependencies: [],
        high_risk: false,
      },
    }, { agentId: "user_clarifier", taskKind: "plan", reason: "Supervisor selected the specialist.", paths: ["/a", "/b"] });
    expect(payload.specialist?.agent_id).toBe("user_clarifier");
    expect(payload.provider).toBe("manus");
    expect(payload.byok).toBe("BLOCKED");
    expect(payload.paths).toEqual(["/a", "/b"]);
    expect(payload.protocol?.contractId).toBe("req-1");
    expect(payload.protocol?.status.private_reasoning_included).toBe(false);
  });

  it("keeps a server-side runtime disable switch without a Desktop binding dependency", async () => {
    process.env.VEYRA_PYTHON_RUNTIME_ENABLED = "0";
    const response = await runPythonAgent({
      workspaceRoot: process.cwd(),
      assignment: { agentId: "user_clarifier", taskKind: "plan", reason: "Supervisor selected the planning specialist." },
      prompt: "Create a component.",
    });
    expect(response).toEqual({ ok: false, error: "PYTHON_RUNTIME_DISABLED_BY_SERVER" });
  });
});
