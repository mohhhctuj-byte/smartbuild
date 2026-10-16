"""Implementation for canonical agent_008: Interactive Animation Specialist."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import interactive_animation_specialist


class InteractiveAnimationSpecialistAgent(SpecialistAgent):
    """Interactive Animation Specialist: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return interactive_animation_specialist(self, context, task)
