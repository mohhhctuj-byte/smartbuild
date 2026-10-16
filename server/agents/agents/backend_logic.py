"""Backend canonical agent category."""
from ..registry import get_agent

DynamicDataConnector = type(get_agent("agent_006"))
QueryOptimizer = type(get_agent("agent_039"))
WebSocketsAgent = type(get_agent("agent_040"))
