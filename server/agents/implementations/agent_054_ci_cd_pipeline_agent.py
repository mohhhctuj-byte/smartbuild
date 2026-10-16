"""Implementation for canonical agent_054: CI/CD Pipeline Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import ci_cd_pipeline_agent


class CiCdPipelineAgentAgent(SpecialistAgent):
    """CI/CD Pipeline Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return ci_cd_pipeline_agent(self, context, task)
