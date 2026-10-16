"""Implementation for canonical agent_020: E2E User Simulator."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import e2e_user_simulator


class E2eUserSimulatorAgent(SpecialistAgent):
    """E2E User Simulator: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return e2e_user_simulator(self, context, task)
