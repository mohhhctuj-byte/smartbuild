"""Implementation for canonical agent_047: Penetration Tester."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import penetration_tester


class PenetrationTesterAgent(SpecialistAgent):
    """Penetration Tester: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return penetration_tester(self, context, task)
