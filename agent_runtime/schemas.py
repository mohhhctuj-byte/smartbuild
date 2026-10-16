"""Typed contracts for Veyra's supervisor-gated Python runtime."""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class AgentStatus(str, Enum):
    PLANNED = "planned"
    RUNNING = "running"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str = Field(min_length=1)
    workspace_root: str = Field(min_length=1)
    project_id: int | None = Field(default=None, gt=0)
    conversation_id: int | None = Field(default=None, gt=0)
    supervisor_reason: str = Field(min_length=1)
    dry_run: bool = False
    granted_tools: tuple[str, ...] = ()
    granted_permissions: tuple[str, ...] = ()
    metadata: dict[str, Any] = Field(default_factory=dict)


class TaskSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str = Field(min_length=1)
    agent_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    prompt: str = ""
    dependencies: tuple[str, ...] = ()
    paths: tuple[str, ...] = ()
    required_tools: tuple[str, ...] = ()
    required_permissions: tuple[str, ...] = ()
    high_risk: bool = False
    dry_run: bool = False


class Artifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    artifact_id: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    path: str | None = None
    content_sha256: str | None = None
    description: str = ""
    verified: bool = False


class ValidationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid: bool
    checks: tuple[str, ...] = ()
    errors: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


class AgentResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: AgentStatus
    agent_id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    summary: str = ""
    artifacts: tuple[Artifact, ...] = ()
    validation: ValidationResult | None = None
    blocked_reason: str | None = None
    failure_reason: str | None = None
    events: tuple[dict[str, Any], ...] = ()


class ApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approval_id: str = Field(min_length=1)
    action: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    requested_by: str = Field(min_length=1)
    approved: bool = False
    approver: str | None = None


class ExecutionPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allowed_tools: tuple[str, ...] = ()
    allowed_permissions: tuple[str, ...] = ()
    allow_network: bool = False
    allow_file_write: bool = False
    allow_shell: bool = False
    require_approval_for_high_risk: bool = True
    dry_run: bool = False
    timeout_seconds: float = Field(default=120.0, gt=0, le=3600)
    max_retries: int = Field(default=0, ge=0, le=5)


RuntimeStatus = Literal["planned", "running", "completed", "blocked", "failed", "cancelled"]


class RequirementContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_id: str = Field(min_length=1)
    user_goal: str = Field(min_length=1)
    requested_features: tuple[str, ...] = ()
    constraints: tuple[str, ...] = ()
    integrations: tuple[str, ...] = ()
    acceptance_criteria: tuple[str, ...] = ()
    non_goals: tuple[str, ...] = ()
    missing_information: tuple[str, ...] = ()


class AssumptionLogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assumption_id: str = Field(min_length=1)
    statement: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    impact: Literal["low", "medium", "high"] = "low"
    requires_confirmation: bool = False


class AcceptanceCriterion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    criterion_id: str = Field(min_length=1)
    statement: str = Field(min_length=1)
    verification_method: str = Field(min_length=1)
    required: bool = True


class EvidenceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence_id: str = Field(min_length=1)
    kind: Literal["test", "browser", "http", "database", "file", "log", "review"]
    summary: str = Field(min_length=1)
    source: str = Field(min_length=1)
    criterion_id: str | None = None
    passed: bool = False
    created_at_ms: int = Field(gt=0)


class DecisionLogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision_id: str = Field(min_length=1)
    question: str = Field(min_length=1)
    decision: str = Field(min_length=1)
    rationale_summary: str = Field(min_length=1)
    alternatives_rejected: tuple[str, ...] = ()
    priority_basis: tuple[str, ...] = ("security", "acceptance", "evidence")


class CritiqueReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    report_id: str = Field(min_length=1)
    reviewers: tuple[str, ...] = ()
    findings: tuple[str, ...] = ()
    risks: tuple[str, ...] = ()
    recommendations: tuple[str, ...] = ()
    approved_for_checkpoint: bool = False


class VerificationReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    report_id: str = Field(min_length=1)
    status: Literal["verified", "blocked", "failed", "incomplete"]
    criteria: tuple[AcceptanceCriterion, ...] = ()
    evidence: tuple[EvidenceItem, ...] = ()
    confidence: Literal["high", "medium", "low"] = "low"
    blocked_reason: str | None = None
    assumptions: tuple[AssumptionLogEntry, ...] = ()


class RecoveryState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recovery_id: str = Field(min_length=1)
    checkpoint_id: str | None = None
    completed_artifacts: tuple[str, ...] = ()
    pending_tasks: tuple[str, ...] = ()
    failures: tuple[str, ...] = ()
    next_action: str = Field(min_length=1)
    safe_to_resume: bool = False
