"""Implementation for canonical agent_062: Model Fine-Tuner."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import model_fine_tuner


class ModelFineTunerAgent(SpecialistAgent):
    """Model Fine-Tuner: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return model_fine_tuner(self, context, task)
