"""Implementation for canonical agent_005: Functional Component Engineer."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import functional_component_engineer


class FunctionalComponentEngineerAgent(SpecialistAgent):
    """Functional Component Engineer: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return functional_component_engineer(self, context, task)
