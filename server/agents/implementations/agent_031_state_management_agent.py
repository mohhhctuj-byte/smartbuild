"""Implementation for canonical agent_031: State Management Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import state_management_agent


class StateManagementAgentAgent(SpecialistAgent):
    """State Management Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return state_management_agent(self, context, task)
