"""Implementation for canonical agent_048: Load Tester."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import load_tester


class LoadTesterAgent(SpecialistAgent):
    """Load Tester: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return load_tester(self, context, task)
