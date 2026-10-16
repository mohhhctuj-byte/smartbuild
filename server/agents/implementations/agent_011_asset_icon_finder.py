"""Implementation for canonical agent_011: Asset & Icon Finder."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import asset_icon_finder


class AssetIconFinderAgent(SpecialistAgent):
    """Asset & Icon Finder: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return asset_icon_finder(self, context, task)
