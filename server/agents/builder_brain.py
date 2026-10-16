"""Bounded, deterministic Builder Brain contract for SmartBuild planning.

This module is not a model prompt and does not call an external provider.  It turns a
BuildContext into a small, content-safe execution contract that the planner can retain
as scoped evidence.  The contract deliberately distinguishes a desired product type
from a capability that is implemented in the current bounded writer set.
"""
from __future__ import annotations

from dataclasses import dataclass
import re

from .agent_specs import BuildContext
from .execution_support import request_profile, request_title


@dataclass(frozen=True)
class BuilderBrainContract:
    """A safe planning record that never copies raw request text into artifacts."""

    product_type: str
    route: str
    capability_status: str
    risk_level: str
    approval_required: bool
    planned_files: tuple[str, ...]
    acceptance_criteria: tuple[str, ...]
    operating_rules: tuple[str, ...]

    def as_artifact(self, context: BuildContext) -> dict[str, object]:
        return {
            "format": "smartbuild-builder-brain-contract-v1",
            "buildScope": {
                "buildRunId": context.run_id,
                "projectId": context.project_id,
                "conversationId": context.conversation_id,
            },
            "goal": request_title(context),
            "productType": self.product_type,
            "route": self.route,
            "capabilityStatus": self.capability_status,
            "riskLevel": self.risk_level,
            "approvalRequired": self.approval_required,
            "plannedFiles": list(self.planned_files),
            "acceptanceCriteria": list(self.acceptance_criteria),
            "operatingRules": list(self.operating_rules),
            "externalActions": "not-performed",
        }


def _contains_any(request: str, terms: tuple[str, ...]) -> bool:
    return any(term in request for term in terms)


_CAPABILITY_TERM = (
    r"(?:external\s+services?|third[ -]party\s+services?|"
    r"backend|back[ -]end|servers?|databases?|db|apis?|"
    r"payment(?:s| processing)?|checkout|auth(?:entication)?|integrations?)"
)
_NEGATED_CAPABILITIES = re.compile(
    rf"\b(?:no|without|not|do not need|don't need|does not need|doesn't need|not using|not use)"
    rf"\s+(?:(?:a|an|any)\s+)?{_CAPABILITY_TERM}"
    rf"(?:(?:\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+){_CAPABILITY_TERM})*",
    re.IGNORECASE,
)
_ARABIC_NEGATED_CAPABILITIES = re.compile(
    rf"(?:بدون|بلا|مش\s+(?:محتاج|عايز)|لا\s+(?:أريد|أحتاج|يحتاج|يتطلب))"
    rf"\s+(?:إلى\s+)?(?:أي\s+)?{_CAPABILITY_TERM}"
    rf"(?:(?:\s*(?:،|,)\s*|\s+(?:و|أو)\s+){_CAPABILITY_TERM})*",
    re.IGNORECASE,
)


def request_with_negated_capabilities_removed(request: str) -> str:
    return _ARABIC_NEGATED_CAPABILITIES.sub(
        " ",
        _NEGATED_CAPABILITIES.sub(" ", request),
    )


def build_builder_brain_contract(context: BuildContext) -> BuilderBrainContract:
    """Classify a request into an honest, bounded implementation contract.

    The implementation deliberately recognizes more product types than the currently
    implemented writers.  Unsupported types become *planned-only* rather than being
    silently rendered as a generic web page.
    """
    request = context.request.casefold()
    capability_request = request_with_negated_capabilities_removed(request)
    high_risk_terms = (
        "deploy", "publish", "production", "delete", "remove", "payment", "checkout",
        "purchase", "send email", "send message", "secret", "api key", "token",
    )
    approval_required = _contains_any(capability_request, high_risk_terms)
    risk_level = "high" if approval_required else "medium" if _contains_any(
        capability_request, ("login", "auth", "database", "backend", "integration", "api")
    ) else "low"

    if _contains_any(request, ("3d game", "three.js game", "babylon", "webgl game")):
        return BuilderBrainContract(
            product_type="game_3d", route="game_3d_build", capability_status="planned-only",
            risk_level=risk_level, approval_required=approval_required,
            planned_files=("index.html", "game.js", "styles.css"),
            acceptance_criteria=(
                "A playable title, playing, paused, and game-over state is implemented.",
                "Keyboard, pointer, resize, win, loss, and restart behavior are exercised.",
                "The saved Build Run contains source, test, and preview evidence for the same scope.",
            ),
            operating_rules=(
                "No game runtime writer is currently selected automatically.",
                "Do not claim the game is playable until the core mechanic is exercised.",
                "External assets, deployment, and provider calls remain blocked without approval.",
            ),
        )
    if _contains_any(request, ("game", "لعبة", "2d", "phaser", "canvas game")):
        return BuilderBrainContract(
            product_type="game_2d", route="game_2d_build", capability_status="planned-only",
            risk_level=risk_level, approval_required=approval_required,
            planned_files=("index.html", "game.js", "styles.css"),
            acceptance_criteria=(
                "A playable title, playing, paused, and game-over state is implemented.",
                "Input, collision or rules, win, loss, restart, and resize behavior are exercised.",
                "The saved Build Run contains source, test, and preview evidence for the same scope.",
            ),
            operating_rules=(
                "No game runtime writer is currently selected automatically.",
                "A visible page alone is not evidence that a game mechanic works.",
                "External assets, deployment, and provider calls remain blocked without approval.",
            ),
        )
    # The bounded contact-form writer intentionally includes a backend contract,
    # SQLite migration, and browser test. Classify that complete workflow before
    # the generic backend route so its supported implementation is not blocked.
    if _contains_any(request, ("contact form", "contact page", "نموذج تواصل", "صفحة تواصل")) and _contains_any(
        request, ("form", "name", "email", "message", "نموذج", "اسم", "إيميل", "رسالة")
    ):
        profile = request_profile(context)
        return BuilderBrainContract(
            product_type="contact_form", route="contact_form_build", capability_status="bounded-writer-supported",
            risk_level=risk_level, approval_required=approval_required,
            planned_files=("index.html", "styles.css", "backend contract", "SQLite migration", "Playwright test"),
            acceptance_criteria=(
                "The contact form renders name, email, and message controls.",
                "Client-side validation errors are visible and actionable.",
                "The backend contract, persistence migration, and browser test are scoped to the Build Run.",
            ),
            operating_rules=(
                "Email delivery remains unconfigured unless an approved provider credential exists.",
                "A successful local form check must not claim that a message was delivered.",
            ),
        )
    if _contains_any(capability_request, ("backend", "api", "database", "migration", "webhook", "باك إند", "قاعدة بيانات", "واجهة برمجية")):
        return BuilderBrainContract(
            product_type="backend", route="backend_build", capability_status="planned-only",
            risk_level=risk_level, approval_required=approval_required,
            planned_files=("server contract", "validation tests", "scoped evidence"),
            acceptance_criteria=(
                "Input validation and owner/build-run scope are defined before persistence.",
                "The requested endpoint or schema behavior has a focused regression test.",
                "No secret, provider response, or external side effect is stored in evidence.",
            ),
            operating_rules=(
                "Database and external integrations require the separately approved capability path.",
                "A backend route is not considered verified without scoped tests and evidence.",
            ),
        )

    profile = request_profile(context)
    product_type = "web_app" if profile.key == "dashboard" or _contains_any(
        request, ("web app", "application", "dashboard", "admin")
    ) else "website"
    return BuilderBrainContract(
        product_type=product_type, route="frontend_build", capability_status="bounded-writer-supported",
        risk_level=risk_level, approval_required=approval_required,
        planned_files=("index.html", "app.js", "styles.css"),
        acceptance_criteria=(
            "Durable request-profile-specific source files are written in the selected Build Run.",
            "The project identity is visibly represented without copying raw request text into source.",
            "Preview, evaluation, checkpoint, and export can pass only with matching same-run evidence.",
        ),
        operating_rules=(
            "Use the existing project stack and small reviewable changes.",
            "Keep external integrations blocked until configured and explicitly approved.",
            "Treat missing source, tests, preview, or evidence as BLOCKED or FAILED, never as PASS.",
        ),
    )
