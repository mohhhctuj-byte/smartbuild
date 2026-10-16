"""Model profile selection without creating any additional numbered agents."""
from __future__ import annotations

from .agent_specs import AgentSpec, ModelProfile
from .model_profiles import get_model_profile


def select_profile(agent: AgentSpec, task_type: str = "implementation") -> ModelProfile:
    if agent.risk_level == "high" or task_type in {"verification", "security"}:
        return get_model_profile("adversarial_review")
    if agent.team == "research":
        return get_model_profile("web_research")
    if task_type == "planning" or agent.team in {"planning", "architecture", "governance"}:
        return get_model_profile("deep_reasoning")
    return get_model_profile("precise_coding")
