"""Implementation for canonical agent_026: Cloud Infra Specialist."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import cloud_infra_specialist


class CloudInfraSpecialistAgent(SpecialistAgent):
    """Cloud Infra Specialist: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return cloud_infra_specialist(self, context, task)
