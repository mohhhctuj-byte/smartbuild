"""Browser-control canonical agent category."""
from ..registry import get_agent

BrowserAutomationAgent = type(get_agent("agent_014"))
AutoGoogleOperator = type(get_agent("agent_015"))
GuiMouseNavigator = type(get_agent("agent_016"))
DomInspectorScraper = type(get_agent("agent_017"))
