"""Implementation for canonical agent_063: Analytics Specialist."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import analytics_specialist


class AnalyticsSpecialistAgent(SpecialistAgent):
    """Analytics Specialist: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return analytics_specialist(self, context, task)
