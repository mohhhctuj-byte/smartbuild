"""Implementation for canonical agent_003: Intent Verifier Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import intent_verifier


class IntentVerifierAgent(SpecialistAgent):
    """Intent Verifier Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return intent_verifier(self, context, task)
