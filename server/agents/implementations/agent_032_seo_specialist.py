"""Implementation for canonical agent_032: SEO Specialist."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import seo_specialist


class SeoSpecialistAgent(SpecialistAgent):
    """SEO Specialist: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return seo_specialist(self, context, task)
