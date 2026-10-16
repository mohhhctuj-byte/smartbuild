"""Implementation for canonical agent_045: Unit Test Specialist."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import unit_test_specialist


class UnitTestSpecialistAgent(SpecialistAgent):
    """Unit Test Specialist: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return unit_test_specialist(self, context, task)
