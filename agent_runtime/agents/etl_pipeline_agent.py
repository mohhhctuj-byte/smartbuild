"""Explicit implementation surface for ETL Pipeline Agent."""
from __future__ import annotations

try:
    from ..base_agent import BaseAgent
    from ..schemas import AgentContext, AgentResult, AgentStatus, TaskSpec
except ImportError:
    from base_agent import BaseAgent
    from schemas import AgentContext, AgentResult, AgentStatus, TaskSpec


class EtlPipelineAgentAgent(BaseAgent):
    agent_id = "etl_pipeline_agent"
    name = "ETL Pipeline Agent"
    description = "Cleans, transforms, validates, and loads data."
    team = "data"
    capabilities = ("data", "supervisor-gated")
    required_tools = ('workspace.read', 'database.inspect')
    required_permissions = ('read-workspace', 'database-inspect')
    input_schema = {"prompt": "string", "paths": "array", "approval": "optional"}
    output_schema = {"status": "agent-status", "summary": "string", "artifacts": "array"}
    dependencies = ('intent_verifier',)
    high_risk = False

    async def run(self, context: AgentContext, task: TaskSpec) -> AgentResult:
        if task.agent_id != self.agent_id:
            return AgentResult(status=AgentStatus.FAILED, agent_id=self.agent_id, run_id=context.run_id, failure_reason="TASK_AGENT_MISMATCH")
        if context.dry_run or task.dry_run:
            return AgentResult(status=AgentStatus.COMPLETED, agent_id=self.agent_id, run_id=context.run_id, summary=f"Dry run planned for {self.name}.")
        return AgentResult(status=AgentStatus.BLOCKED, agent_id=self.agent_id, run_id=context.run_id, blocked_reason="SPECIALIST_TOOL_ADAPTER_REQUIRED", summary=f"{self.name} is registered and supervisor-selected, but its scoped tool adapter is not configured.")
