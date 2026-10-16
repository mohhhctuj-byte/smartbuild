"""Implementation for canonical agent_050: Code Smells Inspector."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import code_smells_inspector


class CodeSmellsInspectorAgent(SpecialistAgent):
    """Code Smells Inspector: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return code_smells_inspector(self, context, task)
