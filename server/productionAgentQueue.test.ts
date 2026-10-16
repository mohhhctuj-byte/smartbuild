import { describe, expect, it } from "vitest";

import { deriveProductionAgentQueuePlan } from "./productionAgentQueue";
import { designAgentInstruction, designAgentQualityBrief } from "./designAgentGateway";
import { BUILDER_AGENT_ID } from "./builderAgentGateway";
import { WEBSITE_BUILDER_AGENT_ID } from "./websiteBuilderAgent";

const summary = {
  registryCount: 300,
  executionMode: "dry-run" as const,
  checkpointAllowed: false,
  selectedAgents: [
    { id: "agent_003", name: "Intent Verifier Agent", team: "planning", role: "Confirms scope", modelProfile: "deep_reasoning", selected: true as const },
    { id: "agent_005", name: "Functional Component Engineer", team: "frontend", role: "Builds UI", modelProfile: "precise_coding", selected: true as const },
  ],
  skippedAgents: [],
  tasks: [
    { taskId: "task-003", agentId: "agent_003", title: "Clarify", dependsOn: [], locks: [], verificationMethods: ["structured-evidence"], selectedReason: "Matches build" },
    { taskId: "task-005", agentId: "agent_005", title: "Implement", dependsOn: ["task-003"], locks: ["project-write"], verificationMethods: ["agent-output-validation"], selectedReason: "Matches UI" },
  ],
  blockedReason: null,
};

describe("deriveProductionAgentQueuePlan", () => {
  it("keeps implementation disabled even if an old build agent is present in a plan", () => {
    const singleAgentSummary = {
      ...summary,
      selectedAgents: [{
        id: WEBSITE_BUILDER_AGENT_ID,
        name: "Archived implementation record",
        team: "website-building",
        role: "Legacy implementation agent",
        modelProfile: "deep_reasoning",
        selected: true as const,
      }],
      tasks: [{
        taskId: "run-website-builder",
        agentId: WEBSITE_BUILDER_AGENT_ID,
        title: "Legacy implementation task",
        dependsOn: [],
        locks: ["project-write"],
        verificationMethods: ["validated-file-output", "workspace-path-scope"],
        selectedReason: "REQUEST_CAPABILITY_MATCH",
      }],
    };
    const plan = deriveProductionAgentQueuePlan(singleAgentSummary);

    expect(plan.tasks).toHaveLength(1);
    expect(plan.seeds).toHaveLength(1);
    expect(plan.tasks[0]).toMatchObject({
      taskId: "run-website-builder",
      agentId: WEBSITE_BUILDER_AGENT_ID,
      modelProfile: "deep_reasoning",
      purpose: expect.stringContaining("Project implementation is disabled"),
      canWriteWorkspace: false,
      allowedPathScopes: [],
      allowedReadPathScopes: [],
    });
  });

  it("creates ordered production definitions without treating dry planning as execution", () => {
    const plan = deriveProductionAgentQueuePlan(summary);
    expect(plan.seeds.map(item => item.executionOrder)).toEqual([1, 2]);
    expect(plan.tasks.map(item => item.canWriteWorkspace)).toEqual([false, true]);
    expect(plan.tasks.map(item => item.modelProfile)).toEqual(["deep_reasoning", "precise_coding"]);
    expect(plan.seeds.every(item => item.implementationHash.length === 64)).toBe(true);
  });

  it("passes the complete design mandate to the production design specialist", () => {
    const designSummary = {
      ...summary,
      selectedAgents: [
        ...summary.selectedAgents,
        { id: "agent_030", name: "Animation & CSS Master", team: "frontend", role: "Design system", modelProfile: "precise_coding", selected: true as const },
      ],
      tasks: [
        ...summary.tasks,
        { taskId: "task-030", agentId: "agent_030", title: "Design", dependsOn: ["task-005"], locks: [], verificationMethods: ["design-review"], selectedReason: "Page design" },
      ],
    };
    const designTask = deriveProductionAgentQueuePlan(designSummary).tasks.find(task => task.agentId === "agent_030");
    expect(designTask?.purpose).toContain(designAgentInstruction());
    expect(designTask?.purpose).toContain(designAgentQualityBrief());
    expect(designTask?.purpose).toContain("visual evidence as a release requirement");
  });

  it("gives the functional builder a request-first implementation brief rather than a fixed template instruction", () => {
    const builderTask = deriveProductionAgentQueuePlan(summary).tasks.find(task => task.agentId === "agent_005");
    expect(builderTask?.purpose).toContain("Implement the user's actual product");
    expect(builderTask?.purpose).toContain("Build real user journeys");
    expect(builderTask?.purpose).toContain("never claim backend");
    expect(BUILDER_AGENT_ID).toBe(WEBSITE_BUILDER_AGENT_ID);
  });

  it("gives No-Fake Assurer bounded read scopes without project write scopes", () => {
    const selectedAgents = [
      ...summary.selectedAgents,
      { id: "agent_009", name: "No-Fake Assurer", team: "governance", role: "Rejects fabricated completion", modelProfile: "adversarial_review" as const, selected: true as const },
    ];
    const tasks = [
      ...summary.tasks,
      { taskId: "task-009", agentId: "agent_009", title: "Inspect", dependsOn: ["task-005"], locks: [], verificationMethods: ["structured-evidence"], selectedReason: "Verification gate" },
    ];

    const plan = deriveProductionAgentQueuePlan({ ...summary, selectedAgents, tasks });
    const noFake = plan.tasks.find(task => task.agentId === "agent_009");
    expect(noFake?.canWriteWorkspace).toBe(false);
    expect(noFake?.allowedPathScopes).toEqual([]);
    expect(noFake?.allowedReadPathScopes).toEqual([
      "index.html", "app.js", "styles.css", "form-validation.js", "evidence/agent-executions/**",
    ]);
  });

  it("rejects dependencies that would execute after their dependent task", () => {
    expect(() => deriveProductionAgentQueuePlan({ ...summary, tasks: [summary.tasks[1], summary.tasks[0]] })).toThrow("AGENT_PLAN_DEPENDENCY_ORDER_INVALID");
  });

  it("rejects a blocked or incomplete selected plan", () => {
    expect(() => deriveProductionAgentQueuePlan({ ...summary, blockedReason: "NEEDS_SECRET" })).toThrow("AGENT_PLAN_BLOCKED");
    expect(() => deriveProductionAgentQueuePlan({ ...summary, tasks: [summary.tasks[0]] })).toThrow("AGENT_PLAN_SELECTION_MISMATCH");
  });

  it("rejects a selected agent with an unregistered model profile", () => {
    const selectedAgents = [{ ...summary.selectedAgents[0], modelProfile: "user-provided-model" }, summary.selectedAgents[1]];
    expect(() => deriveProductionAgentQueuePlan({ ...summary, selectedAgents })).toThrow("AGENT_MODEL_PROFILE_INVALID");
  });
});
