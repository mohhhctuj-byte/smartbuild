"""Evidence-based cognitive operating protocol for Veyra.

This module stores concise audit records only. It deliberately does not accept or
persist chain-of-thought, hidden reasoning, provider prompts, or secret values.
"""
from __future__ import annotations

import re
import time
import uuid
from typing import Any, Iterable

try:
    from .schemas import (
        AcceptanceCriterion,
        AssumptionLogEntry,
        CritiqueReport,
        DecisionLogEntry,
        EvidenceItem,
        RecoveryState,
        RequirementContract,
        VerificationReport,
    )
except ImportError:  # pragma: no cover - direct test execution
    from schemas import (
        AcceptanceCriterion,
        AssumptionLogEntry,
        CritiqueReport,
        DecisionLogEntry,
        EvidenceItem,
        RecoveryState,
        RequirementContract,
        VerificationReport,
    )

_PRIVATE_KEYS = ("chain_of_thought", "private_reasoning", "api_key", "secret", "token")


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _safe_text(value: str) -> str:
    text = value.strip()
    lowered = text.lower()
    key_pattern = r"(?:" + "|".join(re.escape(key) for key in _PRIVATE_KEYS) + r")\s*[:=]"
    if re.search(key_pattern, lowered):
        raise ValueError("PRIVATE_REASONING_OR_SECRET_FIELD_NOT_ALLOWED")
    return text


class CognitiveProtocol:
    """Builds auditable protocol records without exposing private reasoning."""

    def __init__(self) -> None:
        self.requirement_contracts: list[RequirementContract] = []
        self.assumptions: list[AssumptionLogEntry] = []
        self.criteria: list[AcceptanceCriterion] = []
        self.evidence: list[EvidenceItem] = []
        self.decisions: list[DecisionLogEntry] = []
        self.critiques: list[CritiqueReport] = []

    def build_requirement_contract(
        self,
        *,
        user_goal: str,
        requested_features: Iterable[str] = (),
        constraints: Iterable[str] = (),
        integrations: Iterable[str] = (),
        acceptance_criteria: Iterable[str] = (),
        non_goals: Iterable[str] = (),
        missing_information: Iterable[str] = (),
    ) -> RequirementContract:
        contract = RequirementContract(
            contract_id=_id("req"),
            user_goal=_safe_text(user_goal),
            requested_features=tuple(_safe_text(item) for item in requested_features),
            constraints=tuple(_safe_text(item) for item in constraints),
            integrations=tuple(_safe_text(item) for item in integrations),
            acceptance_criteria=tuple(_safe_text(item) for item in acceptance_criteria),
            non_goals=tuple(_safe_text(item) for item in non_goals),
            missing_information=tuple(_safe_text(item) for item in missing_information),
        )
        self.requirement_contracts.append(contract)
        return contract

    def record_assumption(self, *, statement: str, reason: str, impact: str = "low", requires_confirmation: bool = False) -> AssumptionLogEntry:
        entry = AssumptionLogEntry(
            assumption_id=_id("asm"),
            statement=_safe_text(statement),
            reason=_safe_text(reason),
            impact=impact,
            requires_confirmation=requires_confirmation,
        )
        self.assumptions.append(entry)
        return entry

    def create_acceptance_criteria(self, statements: Iterable[tuple[str, str]]) -> tuple[AcceptanceCriterion, ...]:
        created = tuple(
            AcceptanceCriterion(
                criterion_id=_id("criterion"),
                statement=_safe_text(statement),
                verification_method=_safe_text(method),
            )
            for statement, method in statements
        )
        self.criteria.extend(created)
        return created

    def collect_evidence(
        self,
        *,
        kind: str,
        summary: str,
        source: str,
        criterion_id: str | None = None,
        passed: bool = False,
    ) -> EvidenceItem:
        item = EvidenceItem(
            evidence_id=_id("evidence"),
            kind=kind,
            summary=_safe_text(summary),
            source=_safe_text(source),
            criterion_id=criterion_id,
            passed=passed,
            created_at_ms=int(time.time() * 1000),
        )
        self.evidence.append(item)
        return item

    def request_independent_review(self, *, reviewers: Iterable[str], findings: Iterable[str] = (), risks: Iterable[str] = ()) -> CritiqueReport:
        report = CritiqueReport(
            report_id=_id("critique"),
            reviewers=tuple(_safe_text(item) for item in reviewers),
            findings=tuple(_safe_text(item) for item in findings),
            risks=tuple(_safe_text(item) for item in risks),
            recommendations=("Review evidence and blocked conditions before checkpoint.",),
        )
        self.critiques.append(report)
        return report

    def record_decision(self, *, question: str, decision: str, rationale_summary: str, alternatives_rejected: Iterable[str] = ()) -> DecisionLogEntry:
        entry = DecisionLogEntry(
            decision_id=_id("decision"),
            question=_safe_text(question),
            decision=_safe_text(decision),
            rationale_summary=_safe_text(rationale_summary),
            alternatives_rejected=tuple(_safe_text(item) for item in alternatives_rejected),
        )
        self.decisions.append(entry)
        return entry

    def verify(self, *, report_id: str | None = None, confidence: str = "medium") -> VerificationReport:
        criteria = tuple(self.criteria)
        evidence_by_criterion = {item.criterion_id for item in self.evidence if item.passed and item.criterion_id}
        missing = tuple(item.criterion_id for item in criteria if item.required and item.criterion_id not in evidence_by_criterion)
        failed_evidence = tuple(item for item in self.evidence if not item.passed)
        if missing:
            status = "incomplete"
            blocked_reason = "ACCEPTANCE_EVIDENCE_MISSING"
        elif failed_evidence or not self.evidence:
            status = "blocked"
            blocked_reason = "EVIDENCE_FAILED_OR_CONFIGURATION_BLOCKED"
        else:
            status = "verified"
            blocked_reason = None
        return VerificationReport(
            report_id=report_id or _id("verification"),
            status=status,
            criteria=criteria,
            evidence=tuple(self.evidence),
            confidence=confidence,
            blocked_reason=blocked_reason,
            assumptions=tuple(self.assumptions),
        )

    def recover_from_checkpoint(self, *, checkpoint_id: str | None, completed_artifacts: Iterable[str], pending_tasks: Iterable[str], failures: Iterable[str] = ()) -> RecoveryState:
        pending = tuple(_safe_text(item) for item in pending_tasks)
        return RecoveryState(
            recovery_id=_id("recovery"),
            checkpoint_id=checkpoint_id,
            completed_artifacts=tuple(_safe_text(item) for item in completed_artifacts),
            pending_tasks=pending,
            failures=tuple(_safe_text(item) for item in failures),
            next_action=pending[0] if pending else "Review checkpoint evidence before continuing.",
            safe_to_resume=bool(checkpoint_id) and not failures,
        )

    def generate_user_facing_status(self, report: VerificationReport | None = None) -> dict[str, Any]:
        verification = report or self.verify()
        return {
            "verified": [item.summary for item in verification.evidence if item.passed],
            "blocked": [verification.blocked_reason] if verification.blocked_reason else [],
            "assumptions": [entry.statement for entry in verification.assumptions],
            "confidence": verification.confidence,
            "evidence_count": len(verification.evidence),
            "private_reasoning_included": False,
        }
