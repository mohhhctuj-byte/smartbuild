import type { Express, Request, Response } from "express";
import { markCheckpoint } from "./taskGraphStore";
import { cloudWorkspaceStatus } from "./cloudWorkspace";

type User = { id: number };
type WorkspaceDeps = {
  requireUser: (req: Request, res: Response) => Promise<User | null>;
  getConversationForUser: (userId: number, conversationId: number) => Promise<{ projectId: number } | null | undefined>;
  getProjectForUser: (userId: number, projectId: number) => Promise<{ id: number } | null | undefined>;
  appendProjectEvent?: (userId: number, projectId: number, eventType: string, payload: unknown, conversationId?: number) => Promise<void>;
};

const numeric = (value: unknown) => { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; };

export function registerLocalRoutes(app: Express, deps: WorkspaceDeps) {
  app.get("/api/local/capabilities", (_req, res) => {
    res.json({ ...cloudWorkspaceStatus(), requiresUserSelectedFolder: false, scope: "project-scoped" });
  });

  app.get("/api/local/folder", async (req, res) => {
    const user = await deps.requireUser(req, res);
    if (!user) return;
    res.json({ state: "Cloud", folderName: "Cloud workspace" });
  });

  app.post("/api/local/folder", async (req, res) => {
    const user = await deps.requireUser(req, res);
    if (!user) return;
    res.json({ state: "Cloud", folderName: "Cloud workspace" });
  });

  app.post("/api/local/checkpoint", async (req, res) => {
    const user = await deps.requireUser(req, res);
    if (!user) return;
    const projectId = numeric(req.body?.projectId);
    const conversationId = numeric(req.body?.conversationId);
    const evidence = typeof req.body?.evidence === "string" ? req.body.evidence.trim() : "";
    if (!projectId || !conversationId || !evidence) return res.status(400).json({ error: "Project, conversation, and checkpoint evidence are required." });
    const conversation = await deps.getConversationForUser(user.id, conversationId);
    const project = await deps.getProjectForUser(user.id, projectId);
    if (!conversation || conversation.projectId !== projectId || !project) return res.status(404).json({ error: "The selected workspace is unavailable." });
    const graph = markCheckpoint(user.id, projectId, conversationId, evidence.slice(0, 500));
    if (!graph) return res.status(409).json({ error: "Complete Generate, Preview, and QA before saving a checkpoint." });
    await deps.appendProjectEvent?.(user.id, projectId, "checkpoint.saved", { evidence: evidence.slice(0, 500) }, conversationId);
    res.status(201).json({ status: "saved", workspace: "cloud", evidence: evidence.slice(0, 500), graph });
  });
}
