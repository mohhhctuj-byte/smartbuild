"""Implementation for canonical agent_043: Email & Notification Specialist."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import email_notification_specialist


class EmailNotificationSpecialistAgent(SpecialistAgent):
    """Email & Notification Specialist: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return email_notification_specialist(self, context, task)
