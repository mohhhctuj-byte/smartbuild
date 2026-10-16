"""Implementation for canonical agent_034: Internationalization Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import internationalization_agent


class InternationalizationAgentAgent(SpecialistAgent):
    """Internationalization Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return internationalization_agent(self, context, task)
