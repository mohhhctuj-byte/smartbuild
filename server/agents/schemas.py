"""Compatibility exports for typed orchestration records."""

from .agent_specs import AgentRunDecision, AgentSpec, AgentTrace, BuildContext, OrchestrationPlan, TaskDefinition, TaskStatus
from .base import AgentExecution

AgentResult = AgentExecution

__all__ = ("AgentResult", "AgentRunDecision", "AgentSpec", "AgentTrace", "BuildContext", "OrchestrationPlan", "TaskDefinition", "TaskStatus")
