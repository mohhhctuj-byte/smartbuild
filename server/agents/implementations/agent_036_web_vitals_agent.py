"""Implementation for canonical agent_036: Web Vitals Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import web_vitals_agent


class WebVitalsAgentAgent(SpecialistAgent):
    """Web Vitals Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return web_vitals_agent(self, context, task)
