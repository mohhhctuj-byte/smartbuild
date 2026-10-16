"""Explicit implementation surface for Third-Party Integrator."""
from __future__ import annotations

try:
    from ..base_agent import BaseAgent
    from ..schemas import AgentContext, AgentResult, AgentStatus, TaskSpec
except ImportError:
    from base_agent import BaseAgent
    from schemas import AgentContext, AgentResult, AgentStatus, TaskSpec


class ThirdPartyIntegratorAgent(BaseAgent):
    agent_id = "third_party_integrator"
    name = "Third-Party Integrator"
    description = "Connects external apis with retries and validation."
    team = "integrations"
    capabilities = ("integrations", "supervisor-gated")
    required_tools = ('workspace.read', 'network.request')
    required_permissions = ('read-workspace', 'network-request')
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
