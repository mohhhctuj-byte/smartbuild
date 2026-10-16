"""Implementation for canonical agent_042: Background Jobs Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import background_jobs_agent


class BackgroundJobsAgentAgent(SpecialistAgent):
    """Background Jobs Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return background_jobs_agent(self, context, task)
