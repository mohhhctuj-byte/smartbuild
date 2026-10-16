"""Implementation for canonical agent_006: Dynamic Data Connector."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import dynamic_data_connector


class DynamicDataConnectorAgent(SpecialistAgent):
    """Dynamic Data Connector: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return dynamic_data_connector(self, context, task)
