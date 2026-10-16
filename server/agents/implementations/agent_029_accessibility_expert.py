"""Implementation for canonical agent_029: Accessibility Expert."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import accessibility_expert


class AccessibilityExpertAgent(SpecialistAgent):
    """Accessibility Expert: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return accessibility_expert(self, context, task)
