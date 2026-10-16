"""Implementation for canonical agent_024: Security Architect."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import security_architect


class SecurityArchitectAgent(SpecialistAgent):
    """Security Architect: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return security_architect(self, context, task)
