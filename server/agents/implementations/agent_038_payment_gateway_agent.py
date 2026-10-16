"""Implementation for canonical agent_038: Payment Gateway Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import payment_gateway_agent


class PaymentGatewayAgentAgent(SpecialistAgent):
    """Payment Gateway Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return payment_gateway_agent(self, context, task)
