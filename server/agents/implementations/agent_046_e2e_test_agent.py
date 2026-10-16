"""Implementation for canonical agent_046: E2E Test Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import e2e_test_agent


class E2eTestAgentAgent(SpecialistAgent):
    """E2E Test Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return e2e_test_agent(self, context, task)
