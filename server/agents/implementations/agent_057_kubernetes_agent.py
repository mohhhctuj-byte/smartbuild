"""Implementation for canonical agent_057: Kubernetes Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import kubernetes_agent


class KubernetesAgentAgent(SpecialistAgent):
    """Kubernetes Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return kubernetes_agent(self, context, task)
