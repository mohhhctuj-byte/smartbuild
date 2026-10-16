"""Implementation for canonical agent_053: Docker Master."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import docker_master


class DockerMasterAgent(SpecialistAgent):
    """Docker Master: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return docker_master(self, context, task)
