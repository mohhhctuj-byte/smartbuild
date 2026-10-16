import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { registerLocalRoutes } from "./localRoutes";
import { clearPlans, markGenerated, markPreview, markTested, savePlan } from "./taskGraphStore";

function makeApp(userId: number) {
  const app = express();
  app.use(express.json());
  registerLocalRoutes(app, {
    requireUser: async () => ({ id: userId }),
    getConversationForUser: async () => ({ projectId: 42 }),
    getProjectForUser: async () => ({ id: 42 }),
  });
  return app;
}

describe("local HTTP routes", () => {
  beforeEach(() => clearPlans());

  it("reports the Cloud workspace boundary without a Desktop prerequisite", async () => {
    const response = await request(makeApp(800)).get("/api/local/capabilities");
    expect(response.body).toMatchObject({ kind: "cloud", label: "Cloud workspace", directFilesystem: false, desktopBridge: false, requiresUserSelectedFolder: false, scope: "project-scoped" });
  });

  it("returns the Cloud workspace identity instead of accepting an absolute folder binding", async () => {
    const app = makeApp(801);
    expect((await request(app).get("/api/local/folder")).body).toMatchObject({ state: "Cloud", folderName: "Cloud workspace" });
    expect((await request(app).post("/api/local/folder").send({ root: "/tmp/desktop-only" })).body).toMatchObject({ state: "Cloud", folderName: "Cloud workspace" });
  });

  it("rejects checkpoint until Generate, Preview, and QA are verified", async () => {
    const app = makeApp(802);
    const body = { projectId: 42, conversationId: 42, evidence: "checkpoint evidence" };
    expect((await request(app).post("/api/local/checkpoint").send(body)).status).toBe(409);
    savePlan(802, 42, 42, "Route checkpoint");
    expect((await request(app).post("/api/local/checkpoint").send(body)).status).toBe(409);
    markGenerated(802, 42, 42, "generated 1 file");
    markPreview(802, 42, 42, "preview available at http://localhost:3000");
    expect((await request(app).post("/api/local/checkpoint").send(body)).status).toBe(409);
    markTested(802, 42, 42, "pnpm check passed");
    const response = await request(app).post("/api/local/checkpoint").send(body);
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("saved");
    expect(response.body.graph.tasks.find((task: { id: string }) => task.id === "checkpoint").status).toBe("Verified");
  });
});
