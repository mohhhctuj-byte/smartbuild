"""Implementation for canonical agent_025: Performance Architect."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import performance_architect


class PerformanceArchitectAgent(SpecialistAgent):
    """Performance Architect: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return performance_architect(self, context, task)
