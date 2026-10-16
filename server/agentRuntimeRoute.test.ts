import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerAgentRuntimeRoute } from "./agentRuntimeRoute";

describe("agent runtime route", () => {
  it("rejects agent execution before any implementation agent can run", async () => {
    const app = express();
    app.use(express.json());
    const requireUser = vi.fn(async () => ({ id: 900 }));
    registerAgentRuntimeRoute(app, { requireUser });

    const response = await request(app).post("/api/local/agents/run").send({
      projectId: 42,
      conversationId: 42,
      assignment: { agentId: "website_builder", taskKind: "generate", reason: "Build a website." },
      prompt: "Create a website.",
    });

    expect(response.status).toBe(410);
    expect(response.body.code).toBe("BUILD_EXECUTION_DISABLED");
    expect(response.body.error).toContain("Existing workspace data is preserved");
    expect(requireUser).toHaveBeenCalledOnce();
  });

  it("preserves authentication handling before the disabled response", async () => {
    const app = express();
    app.use(express.json());
    registerAgentRuntimeRoute(app, { requireUser: async (_req, res) => {
      res.status(401).json({ error: "Sign in." });
      return null;
    } });

    const response = await request(app).post("/api/local/agents/run").send({});
    expect(response.status).toBe(401);
  });
});
