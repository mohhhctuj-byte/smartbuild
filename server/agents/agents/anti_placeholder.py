"""No-fake canonical agent category."""
from ..registry import get_agent

NoFakeAssurer = type(get_agent("agent_009"))
