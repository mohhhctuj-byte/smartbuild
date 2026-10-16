"""Implementation for canonical agent_012: Competitor UI Scraper."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import competitor_ui_scraper


class CompetitorUiScraperAgent(SpecialistAgent):
    """Competitor UI Scraper: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return competitor_ui_scraper(self, context, task)
