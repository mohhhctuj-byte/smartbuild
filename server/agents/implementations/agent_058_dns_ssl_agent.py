"""Implementation for canonical agent_058: DNS & SSL Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import dns_ssl_agent


class DnsSslAgentAgent(SpecialistAgent):
    """DNS & SSL Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return dns_ssl_agent(self, context, task)
