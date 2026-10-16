"""Implementation for canonical agent_017: DOM Inspector & Scraper."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import dom_inspector_scraper


class DomInspectorScraperAgent(SpecialistAgent):
    """DOM Inspector & Scraper: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return dom_inspector_scraper(self, context, task)
