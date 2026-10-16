"""Implementation for canonical agent_014: Browser Automation Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import browser_automation_agent


class BrowserAutomationAgentAgent(SpecialistAgent):
    """Browser Automation Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return browser_automation_agent(self, context, task)
