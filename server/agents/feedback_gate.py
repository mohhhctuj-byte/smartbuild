"""Explicit feedback gate used only when a request asks for review or approval."""
from __future__ import annotations

from .agent_specs import BuildContext


def feedback_required(context: BuildContext) -> bool:
    text = context.request.lower()
    return any(term in text for term in ("approval", "review with me", "collaborate", "feedback")) and not context.human_feedback
