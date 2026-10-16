"""Interactive canonical agent category; classes are obtained from registry."""
from ..registry import get_agent

InteractiveAnimationSpecialist = type(get_agent("agent_008"))
FormValidationMaster = type(get_agent("agent_007"))
