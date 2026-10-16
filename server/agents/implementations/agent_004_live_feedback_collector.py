"""Implementation for canonical agent_004: Live Feedback Collector."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import live_feedback_collector


class LiveFeedbackCollectorAgent(SpecialistAgent):
    """Live Feedback Collector: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return live_feedback_collector(self, context, task)
