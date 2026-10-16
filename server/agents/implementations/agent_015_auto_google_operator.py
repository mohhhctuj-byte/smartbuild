"""Implementation for canonical agent_015: Auto-Google Operator."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import auto_google_operator


class AutoGoogleOperatorAgent(SpecialistAgent):
    """Auto-Google Operator: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return auto_google_operator(self, context, task)
