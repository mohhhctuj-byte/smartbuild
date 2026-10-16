"""Implementation for canonical agent_051: API Regression Tester."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import api_regression_tester


class ApiRegressionTesterAgent(SpecialistAgent):
    """API Regression Tester: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return api_regression_tester(self, context, task)
