"""Structured, redaction-safe secret requirements for approved providers."""
from __future__ import annotations

import re
from dataclasses import dataclass

from .builder_brain import request_with_negated_capabilities_removed


@dataclass(frozen=True)
class RequiredSecret:
    provider: str
    key_name: str
    endpoint: str
    reason: str
    status: str = "BLOCKED"


def requirement_for_request(request: str) -> tuple[RequiredSecret, ...]:
    text = request_with_negated_capabilities_removed(request.lower())
    explicitly_mocked = re.search(
        r"\b(?:mock|demo|fake|simulated|no external service|without an api)\b|بيانات تجريبية|بدون خدمات خارجية",
        text,
    )
    explicitly_live = re.search(r"\b(?:live|real|production)\b|حقيقي|فعلي", text)
    if explicitly_mocked and not explicitly_live:
        return ()
    requirements: list[RequiredSecret] = []
    if re.search(
        r"\bstripe\s+(?:checkout|payment|payments|api|integration)\b"
        r"|\b(?:use|connect|integrate)\s+stripe\b"
        r"|\b(?:real|live)\s+payment processing\b"
        r"|\baccept (?:real )?payments\b|\bprocess (?:real )?payments\b"
        r"|دفع إلكتروني|قبول المدفوعات",
        text,
        re.IGNORECASE,
    ):
        requirements.append(RequiredSecret("Stripe", "STRIPE_SECRET_KEY", "https://api.stripe.com", "Payment processing requires a configured provider credential."))
    if any(phrase in text for phrase in ("send email", "email delivery", "email notification", "smtp")):
        requirements.append(RequiredSecret("Email provider", "EMAIL_PROVIDER_API_KEY", "provider-specific", "Email delivery was requested but no provider credential is configured."))
    if re.search(r"\banthropic.{0,24}\bapi\b|\bapi.{0,24}\banthropic\b|\b(?:use|connect|integrate|call)\s+(?:the\s+)?anthropic\b|\bbyok\b", text):
        requirements.append(RequiredSecret("External BYOK provider", "ANTHROPIC_API_KEY", "provider-specific", "BYOK is intentionally blocked in the web-only phase."))
    return tuple(requirements)


def redact(value: str) -> str:
    return "[REDACTED]" if value else value
