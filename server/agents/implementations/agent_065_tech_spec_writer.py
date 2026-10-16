"""Implementation for canonical agent_065: Tech Spec Writer."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import tech_spec_writer


class TechSpecWriterAgent(SpecialistAgent):
    """Tech Spec Writer: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return tech_spec_writer(self, context, task)
