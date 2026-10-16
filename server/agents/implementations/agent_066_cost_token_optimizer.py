"""Implementation for canonical agent_066: Cost & Token Optimizer."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import cost_token_optimizer


class CostTokenOptimizerAgent(SpecialistAgent):
    """Cost & Token Optimizer: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return cost_token_optimizer(self, context, task)
