"""Implementation for canonical agent_007: Form & Validation Master."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import form_validation_master


class FormValidationMasterAgent(SpecialistAgent):
    """Form & Validation Master: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return form_validation_master(self, context, task)
