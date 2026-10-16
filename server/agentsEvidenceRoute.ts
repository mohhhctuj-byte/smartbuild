import type { Request, Response } from "express";
import { buildAgentEvidenceForRun, type AgentEvidenceRunIdentity, type ProductionTaskRow, type PublicPlan } from "./agentExecutionEvidence";

export type AgentsEvidenceRouteRun = AgentEvidenceRunIdentity & { workspaceRoot: string };

type ReadEvidence = (run: AgentsEvidenceRouteRun) => Promise<{
  plan: PublicPlan;
  traceContent: string | null;
  productionTasks: readonly ProductionTaskRow[];
}>;

export type AgentsEvidenceRouteDependencies = {
  requireUser: (req: Request, res: Response) => Promise<{ id: number } | null>;
  loadRun: (userId: number, buildId: string) => Promise<AgentsEvidenceRouteRun | null>;
  readEvidence: ReadEvidence;
};

export function createAgentsEvidenceHandler(deps: AgentsEvidenceRouteDependencies) {
  return async function agentsEvidenceHandler(req: Request, res: Response) {
    const user = await deps.requireUser(req, res);
    if (!user) return;

    const run = await deps.loadRun(user.id, req.params.buildId);
    if (!run || run.id !== req.params.buildId || run.userId !== user.id) {
      return res.status(404).json({ error: "Build run not found." });
    }

    try {
      const { plan, traceContent, productionTasks } = await deps.readEvidence(run);
      const response = buildAgentEvidenceForRun({
        requestingUserId: user.id,
        run,
        plan,
        traceContent,
        productionTasks,
      });
      return res.status(response.status).json(response.body);
    } catch {
      return res.status(404).json({ buildRunId: run.id, error: "Agent orchestration evidence is unavailable for this build run." });
    }
  };
}
