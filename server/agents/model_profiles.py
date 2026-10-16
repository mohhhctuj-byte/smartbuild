"""Provider-neutral model profile map; runtime credentials remain server-side."""
from __future__ import annotations

from .agent_specs import ModelProfile


MODEL_PROFILES: dict[str, ModelProfile] = {
    "deep_reasoning": ModelProfile("deep_reasoning", "manus", "Classify requirements, dependencies, and acceptance gates.", "high", 0.0, 1800),
    "precise_coding": ModelProfile("precise_coding", "manus", "Prepare bounded implementation proposals and artifact checks.", "medium", 0.1, 1800),
    "web_research": ModelProfile("web_research", "manus", "Summarize approved source findings with citations and uncertainty.", "medium", 0.1, 1400),
    "vision_understanding": ModelProfile("vision_understanding", "manus", "Assess approved UI or visual assets without inferring unobserved details.", "medium", 0.0, 1200),
    "adversarial_review": ModelProfile("adversarial_review", "manus", "Evaluate executable evidence and prohibit fabricated passes.", "high", 0.0, 1500),
}


def get_model_profile(profile_id: str) -> ModelProfile:
    try:
        return MODEL_PROFILES[profile_id]
    except KeyError as exc:
        raise KeyError("MODEL_PROFILE_NOT_REGISTERED") from exc
