"""Implementation for canonical agent_067: Privacy Inspector."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import privacy_inspector


class PrivacyInspectorAgent(SpecialistAgent):
    """Privacy Inspector: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return privacy_inspector(self, context, task)
