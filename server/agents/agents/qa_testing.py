"""Quality canonical agent category."""
from ..registry import get_agent

TerminalTester = type(get_agent("agent_019"))
E2ETestAgent = type(get_agent("agent_046"))
ApiRegressionTester = type(get_agent("agent_051"))
