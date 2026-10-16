"""Implementation for canonical agent_013: Color Palette Scout."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import color_palette_scout


class ColorPaletteScoutAgent(SpecialistAgent):
    """Color Palette Scout: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return color_palette_scout(self, context, task)
