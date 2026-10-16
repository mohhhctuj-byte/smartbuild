"""Implementation for canonical agent_027: Event-Driven Specialist."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import event_driven_specialist


class EventDrivenSpecialistAgent(SpecialistAgent):
    """Event-Driven Specialist: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return event_driven_specialist(self, context, task)
