import { createHash } from "node:crypto";

import { CANONICAL_AGENT_COUNT, type AgentOrchestrationSummary } from "./agentOrchestrator";
import { asProductionModelProfile, type ProductionAgentTask } from "./agentProductionExecutor";
import type { DurableAgentTaskSeed } from "./db";
import { DESIGN_AGENT_ID, designAgentInstruction, designAgentQualityBrief } from "./designAgentGateway";
import { WEBSITE_BUILDER_AGENT_ID } from "./websiteBuilderAgent";

export type ProductionAgentQueuePlan = {
  tasks: ProductionAgentTask[];
  seeds: DurableAgentTaskSeed[];
};

const implementationHashFor = (task: AgentOrchestrationSummary["tasks"][number], agent: AgentOrchestrationSummary["selectedAgents"][number]) =>
  createHash("sha256")
    .update(JSON.stringify({ agentId: agent.id, team: agent.team, role: agent.role, taskId: task.taskId, verificationMethods: task.verificationMethods }))
    .digest("hex");

const workspaceWriterTeams = new Set(["frontend", "backend", "security", "operations", "integrations", "documentation", "ai"]);
const frontendWriterIds = new Set(["agent_005", "agent_007", "agent_030"]);
const FUNCTIONAL_COMPONENT_ENGINEER_MANDATE = [
  "Implement the user's actual product, not a generic category template.",
  "Extract every explicit user requirement into a screen, component, content, or interaction and preserve it during implementation.",
  "Build real user journeys with working controls, realistic states and domain-specific sample content; never claim backend, authentication, messaging, or payment behavior unless the generated project implements it.",
  "Structure files around the requested scope and keep the existing design specialist's visual direction; do not replace the project with a parallel starter.",
  "Use semantic accessible markup, client-side validation where applicable, responsive behavior, and testable UI state.",
].join(" ");

export function productionAgentCanWriteWorkspace(agentId: string, team: string) {
  if (agentId === WEBSITE_BUILDER_AGENT_ID) return team === "website-building";
  return workspaceWriterTeams.has(team) && (team !== "frontend" || frontendWriterIds.has(agentId));
}

const writableScopesForTeam = (team: string): string[] => {
  switch (team) {
    case "frontend": return ["index.html", "app.js", "styles.css", "form-validation.js", "client/**", "components/**", "src/**", "assets/**", "public/**", "styles/**", "data/**", "tests/**", "README.md", "project.manifest.json"];
    case "backend": return ["server/**", "api/**", "shared/**", "package.json", "requirements.txt"];
    case "data": return ["data/**", "server/**", "shared/**", "docs/data/**"];
    case "ai": return ["ai/**", "server/**", "docs/ai/**"];
    case "integrations": return ["integrations/**", "server/**", "docs/integrations/**"];
    case "security": return ["docs/security/**", "server/security/**", "shared/security/**"];
    case "operations": return ["docs/operations/**", "scripts/**", "deployment/**"];
    case "documentation": return ["docs/**", "README.md"];
    default: return [];
  }
};

const readableScopesForTask = (agentId: string, team: string, canWriteWorkspace: boolean): string[] => {
  if (agentId === "agent_009") {
    return ["index.html", "app.js", "styles.css", "form-validation.js", "evidence/agent-executions/**"];
  }
  return canWriteWorkspace ? writableScopesForTeam(team) : [];
};

/**
 * A dry-run plan is a selection decision, not execution evidence. This function
 * derives independent production task definitions only for the selected agents.
 * It has no side effects and must be followed by durable task seeding.
 */
export function deriveProductionAgentQueuePlan(summary: AgentOrchestrationSummary): ProductionAgentQueuePlan {
  if (summary.executionMode !== "dry-run") throw new Error("AGENT_PLAN_MODE_INVALID");
  if (summary.registryCount !== CANONICAL_AGENT_COUNT) throw new Error("AGENT_REGISTRY_INTEGRITY_FAILED");
  if (summary.blockedReason) throw new Error("AGENT_PLAN_BLOCKED");
  if (summary.selectedAgents.some(agent => agent.id === WEBSITE_BUILDER_AGENT_ID)) {
    if (summary.selectedAgents.length !== 1 || summary.tasks.length !== 1) {
      throw new Error("WEBSITE_BUILDER_PLAN_INVALID");
    }
    const task = summary.tasks.find(candidate => candidate.agentId === WEBSITE_BUILDER_AGENT_ID);
    if (!task || task.dependsOn.length > 0 || task.verificationMethods.length === 0) {
      throw new Error("WEBSITE_BUILDER_PLAN_INVALID");
    }
    const productionTask: ProductionAgentTask = {
      taskId: task.taskId,
      agentId: WEBSITE_BUILDER_AGENT_ID,
      agentName: summary.selectedAgents[0].name,
      role: summary.selectedAgents[0].role,
      modelProfile: asProductionModelProfile("deep_reasoning"),
      purpose: `${task.title}. Project implementation is disabled; preserve all existing project data.`,
      canWriteWorkspace: false,
      allowedPathScopes: [],
      allowedReadPathScopes: [],
      verificationMethods: task.verificationMethods.slice(0, 8),
    };
    return {
      tasks: [productionTask],
      seeds: [{
        taskId: task.taskId,
        agentId: WEBSITE_BUILDER_AGENT_ID,
        executionOrder: 1,
        selectedReason: task.selectedReason,
        implementationHash: createHash("sha256")
          .update(JSON.stringify({ agentId: WEBSITE_BUILDER_AGENT_ID, taskId: task.taskId, verificationMethods: task.verificationMethods }))
          .digest("hex"),
      }],
    };
  }
  const byId = new Map(summary.selectedAgents.map(agent => [agent.id, agent]));
  const agentTasks = summary.tasks.filter(task => byId.has(task.agentId));
  const seenTaskIds = new Set<string>();
  const seenAgentIds = new Set<string>();
  const tasks: ProductionAgentTask[] = [];
  const seeds: DurableAgentTaskSeed[] = [];

  for (let index = 0; index < agentTasks.length; index += 1) {
    const task = agentTasks[index]!;
    const agent = byId.get(task.agentId)!;
    if (seenTaskIds.has(task.taskId) || seenAgentIds.has(task.agentId)) throw new Error("AGENT_PLAN_TASK_INVALID");
    if (task.dependsOn.some((dependency: string) => !seenTaskIds.has(dependency) && byId.has(summary.tasks.find(t => t.taskId === dependency)?.agentId ?? ""))) {
      // Allow depending on tasks present in agentTasks
    }
    // Check dependency order among agentTasks
    if (task.dependsOn.some((dependency: string) => {
      const depTask = summary.tasks.find(t => t.taskId === dependency);
      return depTask && byId.has(depTask.agentId) && !seenTaskIds.has(dependency);
    })) throw new Error("AGENT_PLAN_DEPENDENCY_ORDER_INVALID");
    if (!Array.isArray(task.verificationMethods) || task.verificationMethods.length === 0) throw new Error("AGENT_PLAN_VERIFICATION_MISSING");
    seenTaskIds.add(task.taskId);
    seenAgentIds.add(task.agentId);
    const canWriteWorkspace = productionAgentCanWriteWorkspace(agent.id, agent.team);
    const modelProfile = agent.id === DESIGN_AGENT_ID
      ? asProductionModelProfile("deep_reasoning")
      : asProductionModelProfile(agent.modelProfile);
    const purpose = `${task.title}. Selected because: ${task.selectedReason}`.slice(0, 1_500);
    const productionTask: ProductionAgentTask = {
      taskId: task.taskId,
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      modelProfile,
      purpose: agent.id === DESIGN_AGENT_ID
        ? `${purpose} ${designAgentInstruction()} ${designAgentQualityBrief()}`
        : agent.id === "agent_005"
          ? `${purpose} Functional Component Engineer mandate: ${FUNCTIONAL_COMPONENT_ENGINEER_MANDATE}`
        : purpose,
      canWriteWorkspace,
      allowedPathScopes: canWriteWorkspace ? writableScopesForTeam(agent.team) : [],
      allowedReadPathScopes: readableScopesForTask(agent.id, agent.team, canWriteWorkspace),
      verificationMethods: task.verificationMethods.slice(0, 8),
    };
    tasks.push(productionTask);
    seeds.push({
      taskId: task.taskId,
      agentId: agent.id,
      executionOrder: index + 1,
      selectedReason: task.selectedReason,
      implementationHash: implementationHashFor(task, agent),
    });
  }

  if (tasks.length !== summary.selectedAgents.length || tasks.length === 0) throw new Error("AGENT_PLAN_SELECTION_MISMATCH");
  return { tasks, seeds };
}
