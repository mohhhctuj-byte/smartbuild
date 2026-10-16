"""Implementation for canonical agent_016: GUI & Mouse Navigator."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import gui_mouse_navigator


class GuiMouseNavigatorAgent(SpecialistAgent):
    """GUI & Mouse Navigator: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return gui_mouse_navigator(self, context, task)
