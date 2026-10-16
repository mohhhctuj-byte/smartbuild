"""Implementation for canonical agent_028: Legacy Refactoring Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import legacy_refactoring_agent


class LegacyRefactoringAgentAgent(SpecialistAgent):
    """Legacy Refactoring Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return legacy_refactoring_agent(self, context, task)
