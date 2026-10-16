"""Implementation for canonical agent_037: Auth & Permissions Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import auth_permissions_agent


class AuthPermissionsAgentAgent(SpecialistAgent):
    """Auth & Permissions Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return auth_permissions_agent(self, context, task)
