"""Implementation for canonical agent_002: API Key Request Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import api_key_request


class ApiKeyRequestAgent(SpecialistAgent):
    """API Key Request Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return api_key_request(self, context, task)
