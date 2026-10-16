"""Implementation for canonical agent_018: System Environment Installer."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import system_environment_installer


class SystemEnvironmentInstallerAgent(SpecialistAgent):
    """System Environment Installer: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return system_environment_installer(self, context, task)
