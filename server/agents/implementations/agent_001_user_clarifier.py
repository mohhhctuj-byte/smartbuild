"""Implementation for canonical agent_001: User Clarifier Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import user_clarifier


class UserClarifierAgent(SpecialistAgent):
    """User Clarifier Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return user_clarifier(self, context, task)
