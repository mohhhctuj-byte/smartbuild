"""Implementation for canonical agent_023: API Designer."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import api_designer


class ApiDesignerAgent(SpecialistAgent):
    """API Designer: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return api_designer(self, context, task)
