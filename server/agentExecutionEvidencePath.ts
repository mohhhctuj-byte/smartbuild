export function agentExecutionEvidencePath(taskId: string) {
  const filename = taskId.replace(/:/g, "_");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(filename)) {
    throw new Error("AGENT_TASK_IDENTIFIER_INVALID");
  }
  return `evidence/agent-executions/${filename}.json`;
}
