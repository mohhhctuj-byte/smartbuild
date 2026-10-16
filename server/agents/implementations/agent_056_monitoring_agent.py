"""Implementation for canonical agent_056: Monitoring Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import monitoring_agent


class MonitoringAgentAgent(SpecialistAgent):
    """Monitoring Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return monitoring_agent(self, context, task)
