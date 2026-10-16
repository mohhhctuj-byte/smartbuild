import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AgentOrchestrationSummary } from "./agentOrchestrator";
import { createLocalProductionAgentQueueHooks } from "./localProductionAgentQueue";

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

function orchestrationFixture(): AgentOrchestrationSummary {
  return {
    registryCount: 300,
    executionMode: "dry-run",
    checkpointAllowed: true,
    selectedAgents: [{ id: "smartbuild-website-builder-agent", name: "Website Builder Agent", team: "website-building", role: "Analyzes and implements the requested website", modelProfile: "deep_reasoning", selected: true }],
    skippedAgents: [],
    tasks: [{ taskId: "task-001", agentId: "smartbuild-website-builder-agent", title: "Analyze and implement the website", dependsOn: [], locks: ["project-write"], verificationMethods: ["validated-file-output", "workspace-path-scope"], selectedReason: "REQUEST_CAPABILITY_MATCH" }],
    blockedReason: null,
  };
}

describe("local production agent queue", () => {
  it("persists request-scoped selected tasks so local builds use the Builder without a SQL database", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "smartbuild-local-agent-queue-"));
    temporaryRoots.push(root);
    const scope = { userId: 12, projectId: 34, conversationId: 56, buildRunId: "local-agent-run" };
    const queue = createLocalProductionAgentQueueHooks(root);

    const seeded = await queue.seed({ scope, orchestration: orchestrationFixture() });
    const restored = await createLocalProductionAgentQueueHooks(root).list(scope);

    expect(seeded).toMatchObject([{ taskId: "task-001", agentId: "smartbuild-website-builder-agent", executionOrder: 1, status: "planned" }]);
    expect(restored).toEqual(seeded);
  });

  it("does not reclaim a running task before its worker lease expires", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "smartbuild-local-agent-queue-"));
    temporaryRoots.push(root);
    const scope = { userId: 12, projectId: 34, conversationId: 56, buildRunId: "active-agent-run" };
    const queue = createLocalProductionAgentQueueHooks(root);
    await queue.seed({ scope, orchestration: orchestrationFixture() });

    const snapshotPath = path.join(root, "user-12", "build-active-agent-run.json");
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    snapshot.tasks[0].status = "running";
    snapshot.tasks[0].leaseToken = "active-lease";
    snapshot.tasks[0].startedAt = new Date().toISOString();
    await writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");

    const result = await queue.runOne({
      scope,
      requirement: "Create the application interface",
      workspaceRoot: path.join(process.cwd(), ".smartbuild-cloud-workspaces", "active-agent-run"),
      knownFiles: [],
      tasks: [],
    });

    expect(result).toEqual({ state: "idle" });
    expect(await queue.list(scope)).toMatchObject([{ taskId: "task-001", status: "running" }]);
  });

  it("reclaims a running task after its worker lease expires", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "smartbuild-local-agent-queue-"));
    temporaryRoots.push(root);
    const scope = { userId: 12, projectId: 34, conversationId: 56, buildRunId: "expired-agent-run" };
    const queue = createLocalProductionAgentQueueHooks(root);
    await queue.seed({ scope, orchestration: orchestrationFixture() });

    const snapshotPath = path.join(root, "user-12", "build-expired-agent-run.json");
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    snapshot.tasks[0].status = "running";
    snapshot.tasks[0].leaseToken = "expired-lease";
    snapshot.tasks[0].startedAt = new Date(Date.now() - 31 * 60_000).toISOString();
    await writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");

    const result = await queue.runOne({
      scope,
      requirement: "Create the application interface",
      workspaceRoot: path.join(process.cwd(), ".smartbuild-cloud-workspaces", "expired-agent-run"),
      knownFiles: [],
      tasks: [],
    });

    expect(result).toMatchObject({ state: "blocked", reason: "AGENT_DEFINITION_NOT_FOUND" });
    expect(await queue.list(scope)).toMatchObject([{ taskId: "task-001", status: "blocked" }]);
  });
});
