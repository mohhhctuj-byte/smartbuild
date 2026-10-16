"""Implementation for canonical agent_019: Terminal Tester."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import terminal_tester


class TerminalTesterAgent(SpecialistAgent):
    """Terminal Tester: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return terminal_tester(self, context, task)
