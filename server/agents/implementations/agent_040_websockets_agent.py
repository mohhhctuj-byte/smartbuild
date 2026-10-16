"""Implementation for canonical agent_040: WebSockets Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import websockets_agent


class WebsocketsAgentAgent(SpecialistAgent):
    """WebSockets Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return websockets_agent(self, context, task)
