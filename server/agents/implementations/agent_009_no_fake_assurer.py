"""Implementation for canonical agent_009: No-Fake Assurer."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import no_fake_assurer


class NoFakeAssurerAgent(SpecialistAgent):
    """No-Fake Assurer: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return no_fake_assurer(self, context, task)
