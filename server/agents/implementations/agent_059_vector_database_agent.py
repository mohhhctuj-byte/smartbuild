"""Implementation for canonical agent_059: Vector Database Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import vector_database_agent


class VectorDatabaseAgentAgent(SpecialistAgent):
    """Vector Database Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return vector_database_agent(self, context, task)
