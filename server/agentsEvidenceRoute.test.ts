import express from "express";
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentsEvidenceHandler, type AgentsEvidenceRouteRun } from "./agentsEvidenceRoute";

const ownerId = 42;
const run: AgentsEvidenceRouteRun = {
  id: "run-http-safe",
  userId: ownerId,
  projectId: 6720001,
  conversationId: 6510001,
  workspaceRoot: "/isolated/workspace",
};

const otherOwnerRun: AgentsEvidenceRouteRun = {
  id: "run-other-owner",
  userId: 99,
  projectId: 6720002,
  conversationId: 6510002,
  workspaceRoot: "/isolated/other-workspace",
};

const plan = {
  selectedAgents: [{ id: "agent-001", name: "Interface Specialist", team: "product", role: "safe UI artifact" }],
  skippedAgents: [],
  traceFile: "",
};

const productionTasks = [{
  taskId: "task-http-001",
  agentId: "agent-001",
  executionOrder: 1,
  status: "succeeded",
  implementationHash: "a".repeat(64),
  outputArtifactRefs: ["index.html"],
  evidenceRefs: ["evidence/agent-execution.json"],
  logs: ["smartbuild-agent-execution-v1 artifacts=1 verification_passed=1 verification_blocked=0 additive_actions=0"],
  completedAt: "2026-08-25T00:00:00.000Z",
}];

function buildApp(currentUserId: number, loadedRun: AgentsEvidenceRouteRun | null = run, tasks = productionTasks) {
  const app = express();
  app.get("/api/build-runs/:buildId/agents", createAgentsEvidenceHandler({
    requireUser: async () => ({ id: currentUserId }),
    loadRun: async (userId, buildId) => userId === ownerId && buildId === run.id ? loadedRun : null,
    readEvidence: async () => ({ plan, traceContent: null, productionTasks: tasks }),
  }));
  return app;
}

async function requestJson(app: express.Express, path: string) {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a port");
  try {
    return await new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      const request = http.request({ hostname: "127.0.0.1", port: address.port, path, method: "GET" }, response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { body += chunk; });
        response.on("end", () => {
          try { resolve({ status: response.statusCode ?? 0, body: JSON.parse(body) as Record<string, unknown> }); }
          catch (error) { reject(error); }
        });
      });
      request.on("error", reject);
      request.end();
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

describe("Agents evidence HTTP boundary", () => {
  afterEach(() => expect(true).toBe(true));

  it("returns the selected tuple and safe evidence for the owning user", async () => {
    const response = await requestJson(buildApp(ownerId), "/api/build-runs/run-http-safe/agents");
    expect(response.status).toBe(200);
    expect(response.body.buildRunId).toBe(run.id);
    expect((response.body.evidence as { tuple: unknown }).tuple).toEqual({
      projectId: run.projectId,
      conversationId: run.conversationId,
      buildRunId: run.id,
    });
    expect((response.body.evidence as { agents: Array<{ status: string }> }).agents[0]?.status).toBe("SUCCEEDED");
  });

  it("returns a safe not-found response for a foreign owner or missing run", async () => {
    const foreign = await requestJson(buildApp(99), "/api/build-runs/run-http-safe/agents");
    expect(foreign.status).toBe(404);
    expect(foreign.body.error).toBe("Build run not found.");

    const missing = await requestJson(buildApp(ownerId, null), "/api/build-runs/missing-run/agents");
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("Build run not found.");
  });

  it("rejects a mismatched or foreign run object even if an unsafe loader returns it", async () => {
    const mismatched = await requestJson(buildApp(ownerId, otherOwnerRun), "/api/build-runs/run-http-safe/agents");
    expect(mismatched.status).toBe(404);
    expect(mismatched.body.error).toBe("Build run not found.");
    expect(JSON.stringify(mismatched.body)).not.toContain(otherOwnerRun.id);
    expect(JSON.stringify(mismatched.body)).not.toContain(String(otherOwnerRun.projectId));
  });

  it("never returns durable task logs or free-form blocker text at the HTTP boundary", async () => {
    const response = await requestJson(buildApp(ownerId, run, [{ ...productionTasks[0], logs: ["smartbuild-agent-execution-v1 artifacts=1 verification_passed=1 verification_blocked=0", "untrusted model text", "raw durable task log"], blockedReason: "raw blocker explanation" }]), "/api/build-runs/run-http-safe/agents");
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(response.body);
    expect(serialized).toContain("registryCount");
    expect(serialized).not.toContain("smartbuild-agent-execution-v1");
    expect(serialized).not.toContain("untrusted model text");
    expect(serialized).not.toContain("raw durable task log");
    expect(serialized).not.toContain("raw blocker explanation");
    expect(serialized).not.toContain("logs");
    expect(serialized).not.toContain("blockedReason");
  });
});
