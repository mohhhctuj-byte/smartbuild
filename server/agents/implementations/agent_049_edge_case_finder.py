"""Implementation for canonical agent_049: Edge Case Finder."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import edge_case_finder


class EdgeCaseFinderAgent(SpecialistAgent):
    """Edge Case Finder: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return edge_case_finder(self, context, task)
