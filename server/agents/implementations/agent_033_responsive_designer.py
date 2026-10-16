"""Implementation for canonical agent_033: Responsive Designer."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import responsive_designer


class ResponsiveDesignerAgent(SpecialistAgent):
    """Responsive Designer: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return responsive_designer(self, context, task)
