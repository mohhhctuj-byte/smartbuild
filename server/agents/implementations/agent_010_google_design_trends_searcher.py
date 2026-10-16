"""Implementation for canonical agent_010: Google Design Trends Searcher."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import google_design_trends_searcher


class GoogleDesignTrendsSearcherAgent(SpecialistAgent):
    """Google Design Trends Searcher: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return google_design_trends_searcher(self, context, task)
