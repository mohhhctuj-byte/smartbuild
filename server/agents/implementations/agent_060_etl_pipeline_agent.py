"""Implementation for canonical agent_060: ETL Pipeline Agent."""
from __future__ import annotations

from ..agent_specs import BuildContext, TaskDefinition
from ..base import AgentExecution, SpecialistAgent
from ..responsibility_adapters import etl_pipeline_agent


class EtlPipelineAgentAgent(SpecialistAgent):
    """ETL Pipeline Agent: delegates only to its named scoped responsibility adapter."""

    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        return etl_pipeline_agent(self, context, task)
