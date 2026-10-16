"""Implementation for canonical agent_052: Mutation Tester."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import mutation_tester


class MutationTesterAgent(SpecialistAgent):
    """Mutation Tester: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return mutation_tester(self, context, task)
