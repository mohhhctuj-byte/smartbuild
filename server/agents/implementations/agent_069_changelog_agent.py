"""Implementation for canonical agent_069: Changelog Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import changelog_agent


class ChangelogAgentAgent(SpecialistAgent):
    """Changelog Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return changelog_agent(self, context, task)
