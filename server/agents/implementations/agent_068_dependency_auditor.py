"""Implementation for canonical agent_068: Dependency Auditor."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import dependency_auditor


class DependencyAuditorAgent(SpecialistAgent):
    """Dependency Auditor: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return dependency_auditor(self, context, task)
