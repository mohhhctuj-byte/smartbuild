"""Implementation for canonical agent_044: Third-Party Integrator."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import third_party_integrator


class ThirdPartyIntegratorAgent(SpecialistAgent):
    """Third-Party Integrator: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return third_party_integrator(self, context, task)
