"""Governance canonical agent category."""
from ..registry import get_agent

UserClarifierAgent = type(get_agent("agent_001"))
ApiKeyRequestAgent = type(get_agent("agent_002"))
IntentVerifierAgent = type(get_agent("agent_003"))
LiveFeedbackCollector = type(get_agent("agent_004"))
