"""Implementation for canonical agent_041: Caching Specialist."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import caching_specialist


class CachingSpecialistAgent(SpecialistAgent):
    """Caching Specialist: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return caching_specialist(self, context, task)
