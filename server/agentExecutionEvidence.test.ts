import { describe, expect, it } from "vitest";
import { buildAgentEvidenceForRun, buildAgentExecutionEvidence } from "./agentExecutionEvidence";

describe("buildAgentExecutionEvidence", () => {
  const plan = {
    registryCount: 300,
    executionMode: "dry-run",
    traceFile: "build-42.jsonl",
    selectedAgents: [
      { id: "planner", name: "Planner", team: "strategy", role: "plan" },
      { id: "tester", name: "Tester", team: "quality", role: "verify" },
    ],
    skippedAgents: [{ id: "designer", reason: "No design task was selected. SECRET_MARKER_DO_NOT_EXPOSE" }],
    tasks: [{ agentId: "planner", selectedReason: "REQUEST_CAPABILITY_MATCH" }, { agentId: "tester", selectedReason: "raw user requirement must not escape" }],
  };

  it("keeps dry-run labels, scoped tuple, ordered timestamps, and only safe evidence references", () => {
    const evidence = buildAgentExecutionEvidence({
      projectId: 42,
      conversationId: 43,
      buildRunId: "run-44",
      plan,
      traceContent: [
        JSON.stringify({ agentId: "tester", event: "task_completed", status: "completed", timestampMs: 1_710_000_002_000, evidenceRefs: ["evidence/test-output.json", "evidence/private/trace.json", "evidence/provider.log", "../../secret"] }),
        JSON.stringify({ agentId: "planner", event: "plan_created", status: "completed", timestampMs: 1_710_000_001_000, evidenceRefs: ["evidence/agent-plan.json"] }),
      ].join("\n"),
    });

    expect(evidence).toMatchObject({ tuple: { projectId: 42, conversationId: 43, buildRunId: "run-44" }, registryCount: 300, executionMode: "dry-run", totals: { selected: 2, skipped: 1, planned: 0, traceObserved: 2 } });
    expect(evidence.trace).toEqual({ file: "evidence/agent-traces/build-42.jsonl", present: true, eventCount: 2 });
    expect(evidence.agents.map(agent => [agent.id, agent.status, agent.sequence])).toEqual([["tester", "DRY_RUN_OBSERVED", 1], ["planner", "DRY_RUN_OBSERVED", 2], ["designer", "SKIPPED", null]]);
    expect(evidence.agents.find(agent => agent.id === "tester")?.evidenceRefs).toEqual(["evidence/test-output.json"]);
    expect(evidence.agents.find(agent => agent.id === "planner")?.selectionReason).toBe("REQUEST_CAPABILITY_MATCH");
    expect(evidence.agents.find(agent => agent.id === "tester")?.selectionReason).toBe("SCOPED_WORKFLOW_DEPENDENCY");
    expect(evidence.agents.find(agent => agent.id === "designer")?.selectionReason).toBe("SCOPED_PLAN_NOT_SELECTED");
    expect(JSON.stringify(evidence)).not.toContain("SECRET_MARKER_DO_NOT_EXPOSE");
    expect(JSON.stringify(evidence)).not.toContain("raw user requirement must not escape");
    expect(evidence.agents.every(agent => !agent.detail.includes("autonomous production execution") || agent.status === "DRY_RUN_OBSERVED")).toBe(true);
  });

  it("marks selected agents as planned when no scoped trace proves a supervisor event", () => {
    const evidence = buildAgentExecutionEvidence({ projectId: 1, conversationId: 2, buildRunId: "run-3", plan, traceContent: null });
    expect(evidence.totals).toMatchObject({ selected: 2, skipped: 1, planned: 2, traceObserved: 0 });
    expect(evidence.agents.filter(agent => agent.status === "PLANNED").map(agent => agent.id)).toEqual(["planner", "tester"]);
    expect(evidence.trace.present).toBe(false);
  });

  it("uses durable production tasks only for the matching Build Run evidence and redacts unsafe refs", () => {
    const evidence = buildAgentExecutionEvidence({
      projectId: 42, conversationId: 43, buildRunId: "run-44", plan, traceContent: null,
      productionTasks: [
        { taskId: "task-planner", agentId: "planner", executionOrder: 2, status: "succeeded", implementationHash: "a".repeat(64), outputArtifactRefs: ["index.html", "agent-artifacts/original/agent_003/task-planner.md", "agent-artifacts/original/agent_003/task-planner.work-product.json", "agent-artifacts/pr-001/task-planner.md", "agent-artifacts/pr-001/task-planner.work-product.json", "config/.env", "private/session.json", "keys/release.pem", "../outside"], evidenceRefs: ["evidence/agent-executions/task-planner.json", "evidence/sessions/runtime.json", "evidence/release.log", "agent-trace:evidence/hidden.json"], logs: ["untrusted model text must not be returned", "smartbuild-agent-execution-v1 artifacts=5 verification_passed=2 verification_blocked=0 additive_actions=4 python_produced_artifacts=2 python_verifications=3 python_next_actions=1"], completedAt: "2026-08-23T10:00:00.000Z" },
        { taskId: "task-tester", agentId: "tester", executionOrder: 3, status: "blocked", blockedReason: "EXTERNAL_CAPABILITY_UNAVAILABLE", evidenceRefs: ["evidence/agent-executions/task-tester.json"] },
      ],
    });

    expect(evidence.executionMode).toBe("production");
    expect(evidence.totals).toMatchObject({ selected: 2, skipped: 1, succeeded: 1, blocked: 1, planned: 0, traceObserved: 0 });
    expect(evidence.agents.map(agent => [agent.id, agent.status, agent.sequence])).toEqual([ ["planner", "SUCCEEDED", 2], ["tester", "BLOCKED", 3], ["designer", "SKIPPED", null] ]);
    expect(evidence.agents[0]).toMatchObject({ artifactRefs: ["index.html", "agent-artifacts/original/agent_003/task-planner.md", "agent-artifacts/original/agent_003/task-planner.work-product.json", "agent-artifacts/pr-001/task-planner.md", "agent-artifacts/pr-001/task-planner.work-product.json"], artifactDetails: [
      { path: "index.html", category: "SCOPED_ARTIFACT" },
      { path: "agent-artifacts/original/agent_003/task-planner.md", category: "ORIGINAL_REPORT" },
      { path: "agent-artifacts/original/agent_003/task-planner.work-product.json", category: "WORK_PRODUCT_MANIFEST" },
      { path: "agent-artifacts/pr-001/task-planner.md", category: "ADDITIVE_REPORT" },
      { path: "agent-artifacts/pr-001/task-planner.work-product.json", category: "WORK_PRODUCT_MANIFEST" },
    ], executionSummary: { artifactCount: 5, verification: { passed: 2, blocked: 0 }, additiveActionCount: 4, pythonExecution: { producedArtifactCount: 2, verificationCount: 3, nextActionCount: 1 } }, evidenceRefs: ["evidence/agent-executions/task-planner.json"], implementationHash: "a".repeat(64), timestamp: "2026-08-23T10:00:00.000Z" });
    expect(evidence.agents[1].detail).toContain("EXTERNAL_CAPABILITY_UNAVAILABLE");
    expect(JSON.stringify(evidence)).not.toContain("untrusted model text");
    expect(JSON.stringify(evidence)).not.toContain("report body must not escape");
    expect(JSON.stringify(evidence)).not.toContain("config/.env");
    expect(JSON.stringify(evidence)).not.toContain("private/session.json");
    expect(JSON.stringify(evidence)).not.toContain("keys/release.pem");
    expect(JSON.stringify(evidence)).not.toContain("evidence/sessions/runtime.json");
    expect(JSON.stringify(evidence)).not.toContain("evidence/release.log");
  });

  it("replaces a legacy free-form blocker with a fixed public code", () => {
    const evidence = buildAgentExecutionEvidence({
      projectId: 42, conversationId: 43, buildRunId: "run-44", plan, traceContent: null,
      productionTasks: [
        { taskId: "task-planner", agentId: "planner", executionOrder: 1, status: "blocked", blockedReason: "RAW_REQUEST_SECRET_MARKER", evidenceRefs: ["evidence/agent-executions/task-planner.json"] },
      ],
    });
    expect(evidence.agents.find(agent => agent.id === "planner")?.detail).toContain("AGENT_TASK_BLOCKED");
    expect(JSON.stringify(evidence)).not.toContain("RAW_REQUEST_SECRET_MARKER");
  });

  it("retains only known scoped Python output and source blocker codes", () => {
    const evidence = buildAgentExecutionEvidence({
      projectId: 42, conversationId: 43, buildRunId: "run-44", plan, traceContent: null,
      productionTasks: [
        { taskId: "task-planner", agentId: "planner", executionOrder: 1, status: "blocked", blockedReason: "SCOPED_SOURCE_NOT_AVAILABLE" },
        { taskId: "task-tester", agentId: "tester", executionOrder: 2, status: "failed", blockedReason: "PYTHON_AGENT_SOURCE_OUTPUT_INVALID" },
      ],
    });

    expect(evidence.agents.find(agent => agent.id === "planner")?.detail).toContain("SCOPED_SOURCE_NOT_AVAILABLE");
    expect(evidence.agents.find(agent => agent.id === "tester")?.detail).toContain("PYTHON_AGENT_SOURCE_OUTPUT_INVALID");
    expect(JSON.stringify(evidence)).not.toContain("RAW_REQUEST_SECRET_MARKER");
  });

  it("accepts only a validated quantitative summary from a persisted task snapshot", () => {
    const evidence = buildAgentExecutionEvidence({
      projectId: 42, conversationId: 43, buildRunId: "run-44", plan, traceContent: null,
      productionTasks: [{
        taskId: "task-planner", agentId: "planner", executionOrder: 1, status: "succeeded",
        executionSummary: {
          artifactCount: 2,
          verification: { passed: 1, blocked: 0 },
          additiveActionCount: 3,
          pythonExecution: { producedArtifactCount: 2, verificationCount: 1, nextActionCount: 0 },
          rawLog: "must-not-escape",
        },
        logs: ["untrusted model text must not be returned"],
      }],
    });

    expect(evidence.agents.find(agent => agent.id === "planner")?.executionSummary).toEqual({
      artifactCount: 2,
      verification: { passed: 1, blocked: 0 },
      additiveActionCount: 3,
      pythonExecution: { producedArtifactCount: 2, verificationCount: 1, nextActionCount: 0 },
    });
    expect(JSON.stringify(evidence)).not.toContain("must-not-escape");
    expect(JSON.stringify(evidence)).not.toContain("untrusted model text");
  });

  it("binds the API contract to the requesting owner and exact persisted Build Run tuple", () => {
    const matching = buildAgentEvidenceForRun({
      requestingUserId: 7,
      run: { id: "run-44", userId: 7, projectId: 42, conversationId: 43 },
      plan,
      traceContent: null,
      productionTasks: [],
    });
    expect(matching.status).toBe(200);
    if (matching.status === 200) {
      expect(matching.body.buildRunId).toBe("run-44");
      expect(matching.body.evidence.tuple).toEqual({ projectId: 42, conversationId: 43, buildRunId: "run-44" });
    }

    const foreign = buildAgentEvidenceForRun({
      requestingUserId: 8,
      run: { id: "run-44", userId: 7, projectId: 42, conversationId: 43 },
      plan,
    });
    expect(foreign).toEqual({ status: 404, body: { buildRunId: "run-44", error: "Agent orchestration evidence is unavailable for this build run." } });

    const missing = buildAgentEvidenceForRun({ requestingUserId: 7, run: null, plan });
    expect(missing).toEqual({ status: 404, body: { buildRunId: null, error: "Agent orchestration evidence is unavailable for this build run." } });
  });

  it("withholds a successful state when selected agents or durable task rows are ambiguous", () => {
    const ambiguousPlan = {
      ...plan,
      selectedAgents: [
        { id: "planner", name: "Planner", team: "strategy", role: "plan" },
        { id: "planner", name: "Planner duplicate", team: "strategy", role: "plan" },
      ],
    };
    const evidence = buildAgentExecutionEvidence({
      projectId: 42, conversationId: 43, buildRunId: "run-44", plan: ambiguousPlan, traceContent: null,
      productionTasks: [
        { taskId: "task-planner-a", agentId: "planner", executionOrder: 1, status: "succeeded", outputArtifactRefs: ["index.html"] },
        { taskId: "task-planner-b", agentId: "planner", executionOrder: 2, status: "succeeded", outputArtifactRefs: ["evidence/private/trace.json"] },
      ],
    });

    const plannerRows = evidence.agents.filter(agent => agent.id === "planner");
    expect(plannerRows).toHaveLength(2);
    expect(plannerRows.every(agent => agent.status === "BLOCKED")).toBe(true);
    expect(plannerRows.every(agent => agent.artifactRefs.length === 0 && agent.evidenceRefs.length === 0)).toBe(true);
    expect(plannerRows.every(agent => agent.detail === "Selected agent plan is ambiguous; production task evidence is withheld.")).toBe(true);
    expect(evidence.totals).toMatchObject({ selected: 2, succeeded: 0, blocked: 2 });
  });
});
