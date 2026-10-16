"""Implementation for canonical agent_039: Query Optimizer."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import query_optimizer


class QueryOptimizerAgent(SpecialistAgent):
    """Query Optimizer: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return query_optimizer(self, context, task)
