import type { Express, Request, Response } from "express";

export type AgentRuntimeRouteDeps = {
  requireUser: (req: Request, res: Response) => Promise<{ id: number } | null>;
};

export function registerAgentRuntimeRoute(app: Express, deps: AgentRuntimeRouteDeps) {
  app.post("/api/local/agents/run", async (req, res) => {
    const user = await deps.requireUser(req, res);
    if (!user) return;
    return res.status(410).json({
      code: "BUILD_EXECUTION_DISABLED",
      error: "Implementation tasks are disabled. Existing workspace data is preserved.",
    });
  });
}
