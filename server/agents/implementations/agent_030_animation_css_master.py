"""Implementation for canonical agent_030: Animation & CSS Master."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import animation_css_master


class AnimationCssMasterAgent(SpecialistAgent):
    """Animation & CSS Master: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return animation_css_master(self, context, task)
