"""Data and AI canonical agent category."""
from ..registry import get_agent

VectorDatabaseAgent = type(get_agent("agent_059"))
EtlPipelineAgent = type(get_agent("agent_060"))
PromptEngineeringAgent = type(get_agent("agent_070"))
