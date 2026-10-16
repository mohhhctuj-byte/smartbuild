"""Implementation for canonical agent_055: Infrastructure as Code Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import infrastructure_as_code_agent


class InfrastructureAsCodeAgentAgent(SpecialistAgent):
    """Infrastructure as Code Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return infrastructure_as_code_agent(self, context, task)
