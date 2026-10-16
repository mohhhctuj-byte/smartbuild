"""Implementation for canonical agent_061: Search Index Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import search_index_agent


class SearchIndexAgentAgent(SpecialistAgent):
    """Search Index Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return search_index_agent(self, context, task)
