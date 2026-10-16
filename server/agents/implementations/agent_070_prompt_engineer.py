"""Implementation for canonical agent_070: Prompt Engineering Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import prompt_engineer


class PromptEngineerAgent(SpecialistAgent):
    """Prompt Engineering Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return prompt_engineer(self, context, task)
