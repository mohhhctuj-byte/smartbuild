"""Implementation for canonical agent_035: Component Library Manager."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import component_library_manager


class ComponentLibraryManagerAgent(SpecialistAgent):
    """Component Library Manager: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return component_library_manager(self, context, task)
