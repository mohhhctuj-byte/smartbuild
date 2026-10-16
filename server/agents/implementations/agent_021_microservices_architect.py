"""Implementation for canonical agent_021: Microservices Architect."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import microservices_architect


class MicroservicesArchitectAgent(SpecialistAgent):
    """Microservices Architect: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return microservices_architect(self, context, task)
