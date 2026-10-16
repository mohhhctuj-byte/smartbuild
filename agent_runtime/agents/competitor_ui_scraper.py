"""Explicit implementation surface for Competitor UI Scraper."""
from __future__ import annotations

try:
    from ..base_agent import BaseAgent
    from ..schemas import AgentContext, AgentResult, AgentStatus, TaskSpec
except ImportError:
    from base_agent import BaseAgent
    from schemas import AgentContext, AgentResult, AgentStatus, TaskSpec


class CompetitorUiScraperAgent(BaseAgent):
    agent_id = "competitor_ui_scraper"
    name = "Competitor UI Scraper"
    description = "Analyzes authorized competitor interfaces."
    team = "research"
    capabilities = ("research", "supervisor-gated")
    required_tools = ('web.search', 'source.read')
    required_permissions = ('web-search', 'source-read', 'explicit-approval')
    input_schema = {"prompt": "string", "paths": "array", "approval": "optional"}
    output_schema = {"status": "agent-status", "summary": "string", "artifacts": "array"}
    dependencies = ()
    high_risk = True

    async def run(self, context: AgentContext, task: TaskSpec) -> AgentResult:
        if task.agent_id != self.agent_id:
            return AgentResult(status=AgentStatus.FAILED, agent_id=self.agent_id, run_id=context.run_id, failure_reason="TASK_AGENT_MISMATCH")
        if context.dry_run or task.dry_run:
            return AgentResult(status=AgentStatus.COMPLETED, agent_id=self.agent_id, run_id=context.run_id, summary=f"Dry run planned for {self.name}.")
        return AgentResult(status=AgentStatus.BLOCKED, agent_id=self.agent_id, run_id=context.run_id, blocked_reason="SPECIALIST_TOOL_ADAPTER_REQUIRED", summary=f"{self.name} is registered and supervisor-selected, but its scoped tool adapter is not configured.")
