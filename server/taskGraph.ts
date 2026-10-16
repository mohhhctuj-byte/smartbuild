import { z } from "zod";
import { getSpecialistAssignment } from "./specialistAgents";

export const taskStatusSchema = z.enum(["Designed", "Wired", "Configured", "Running", "Tested", "Verified", "Blocked", "Failed"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskKindSchema = z.enum(["plan", "generate", "preview", "test", "checkpoint"]);
export type TaskKind = z.infer<typeof taskKindSchema>;

export const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: taskKindSchema,
  status: taskStatusSchema,
  dependsOn: z.array(z.string()).default([]),
  specialist: z.string().min(1),
  evidence: z.string().min(1),
});
export type WorkspaceTask = z.infer<typeof taskSchema>;

export const taskGraphSchema = z.object({
  goal: z.string().min(1),
  summary: z.string().min(1),
  folderState: z.enum(["Unbound", "Bound"]).default("Unbound"),
  tasks: z.array(taskSchema).min(1),
});
export type TaskGraph = z.infer<typeof taskGraphSchema>;

export function validateTaskGraph(graph: TaskGraph): TaskGraph {
  for (const task of graph.tasks) getSpecialistAssignment(task.specialist, task.kind);
  return graph;
}

export function buildInitialTaskGraph(goal: string): TaskGraph {
  const cleanGoal = goal.trim();
  return validateTaskGraph({
    goal: cleanGoal,
    summary: "A verified workspace change with an auditable plan, generated output, preview evidence, tests, and a checkpoint.",
    folderState: "Unbound",
    tasks: [
      { id: "plan", title: "Turn the request into an implementation plan", kind: "plan", status: "Designed", dependsOn: [], specialist: "supervisor", evidence: "Structured task graph is valid." },
      { id: "generate", title: "Generate or update the required project files", kind: "generate", status: "Designed", dependsOn: ["plan"], specialist: "builder", evidence: "Every changed file has a path and reason." },
      { id: "preview", title: "Run the real project preview", kind: "preview", status: "Blocked", dependsOn: ["generate"], specialist: "preview", evidence: "Preview URL or explicit blocked reason." },
      { id: "test", title: "Run type checks and automated tests", kind: "test", status: "Blocked", dependsOn: ["preview"], specialist: "qa", evidence: "Command exit status and captured output." },
      { id: "checkpoint", title: "Create a restore point after verification", kind: "checkpoint", status: "Blocked", dependsOn: ["test"], specialist: "release", evidence: "Manus checkpoint identifier." },
    ],
  });
}

export function transitionTask(graph: TaskGraph, taskId: string, next: TaskStatus, evidence?: string): TaskGraph {
  const task = graph.tasks.find(item => item.id === taskId);
  if (!task) throw new Error("TASK_NOT_FOUND");
  if (next === "Verified" && !evidence?.trim()) throw new Error("VERIFICATION_EVIDENCE_REQUIRED");
  return { ...graph, tasks: graph.tasks.map(item => item.id === taskId ? { ...item, status: next, evidence: evidence?.trim() || item.evidence } : item) };
}
