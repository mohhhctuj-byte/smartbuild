"""Supervisor-gated implementation base for every canonical SmartBuild agent."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from time import time
from typing import Any
from uuid import uuid4

from .agent_specs import AgentRunDecision, AgentSpec, AgentTrace, BuildContext, TaskDefinition, TaskStatus, assert_safe_relative_path


SAFE_BLOCKED_REASON_CODES = frozenset({
    "AGENT_DEFINITION_NOT_FOUND",
    "AGENT_TASK_BLOCKED",
    "ACCESSIBILITY_SOURCE_CHECK_FAILED",
    "EXTERNAL_CAPABILITY_UNAVAILABLE",
    "EXTERNAL_PROVIDER_NOT_CONFIGURED",
    "INTEGRATION_NOT_CONFIGURED",
    "RESPONSIVE_SOURCE_CHECK_FAILED",
    "SCOPED_SOURCE_NOT_AVAILABLE",
    "UNSUPPORTED_IMPLEMENTATION_CAPABILITY",
})


def safe_blocked_reason(reason: str | None) -> str:
    return reason if reason in SAFE_BLOCKED_REASON_CODES else "AGENT_TASK_BLOCKED"


@dataclass(frozen=True)
class AgentExecution:
    run_id: str
    agent_id: str
    task_id: str
    status: TaskStatus
    summary: str
    changed_files: tuple[str, ...] = ()
    produced_artifacts: tuple[str, ...] = ()
    evidence_refs: tuple[str, ...] = ()
    logs: tuple[str, ...] = ()
    required_secrets: tuple[str, ...] = ()
    verification_report: tuple[str, ...] = ()
    next_actions: tuple[str, ...] = ()
    blocked_reason: str | None = None


class SpecialistAgent(ABC):
    """A bounded specialist; concrete registry entries must implement their own responsibility."""

    spec: AgentSpec

    def can_run(self, context: BuildContext, task: TaskDefinition) -> AgentRunDecision:
        if task.agent_id != self.spec.id:
            return AgentRunDecision(False, TaskStatus.FAILED, "TASK_AGENT_MISMATCH")
        try:
            for path in context.selected_paths:
                assert_safe_relative_path(path)
        except ValueError as exc:
            return AgentRunDecision(False, TaskStatus.BLOCKED, safe_blocked_reason(str(exc)))
        missing_tools = set(task.allowed_tool_scopes or self.spec.allowed_tool_scopes) - set(context.granted_tool_scopes)
        if missing_tools:
            return AgentRunDecision(False, TaskStatus.BLOCKED, safe_blocked_reason(f"MISSING_TOOL_SCOPES:{','.join(sorted(missing_tools))}"))
        if self.spec.requires_secret and not context.available_secrets:
            return AgentRunDecision(False, TaskStatus.WAITING_FOR_SECRET, safe_blocked_reason("REQUIRED_SECRET_NOT_CONFIGURED"))
        if self.spec.requires_human_feedback and not context.human_feedback:
            return AgentRunDecision(False, TaskStatus.WAITING_FOR_FEEDBACK, safe_blocked_reason("HUMAN_FEEDBACK_REQUIRED"))
        return AgentRunDecision(True, TaskStatus.PLANNED, "SUPERVISOR_SCOPE_APPROVED")

    def run(self, context: BuildContext, task: TaskDefinition) -> tuple[AgentExecution, AgentTrace]:
        decision = self.can_run(context, task)
        if not decision.allowed:
            if not context.dry_run:
                # Imported lazily to avoid a module cycle: the support layer records a
                # redacted per-task evidence file for blocked and waiting outcomes too.
                from .execution_support import agent_evidence
                execution = agent_evidence(self, context, task, responsibility="supervisor readiness gate", findings=(decision.reason,), status=decision.status, blocked_reason=decision.reason)
                return execution, self._trace(context, task, "agent.blocked", decision.status, evidence_refs=execution.evidence_refs, blocked_reason=decision.reason)
            execution = AgentExecution(context.run_id, self.spec.id, task.task_id, decision.status, f"{self.spec.name} did not run.", logs=("Planning gate prevented execution.",), next_actions=(decision.reason,), blocked_reason=decision.reason)
            return execution, self._trace(context, task, "agent.blocked", decision.status, blocked_reason=decision.reason)
        if context.dry_run:
            evidence = (f"dry-run:{task.task_id}",)
            execution = AgentExecution(context.run_id, self.spec.id, task.task_id, TaskStatus.SUCCEEDED, f"Explicit planning dry-run completed for {self.spec.name}.", produced_artifacts=(), evidence_refs=evidence, logs=("Planning mode only; no production artifact was written.",), verification_report=("planning-only",), next_actions=("Run the selected responsibility through production execution.",))
            return execution, self._trace(context, task, "agent.dry_run", TaskStatus.SUCCEEDED, evidence_refs=evidence, execution_mode="dry-run")
        execution = self.perform(context, task)
        if execution.agent_id != self.spec.id or execution.task_id != task.task_id:
            raise RuntimeError("AGENT_EXECUTION_SCOPE_MISMATCH")
        if execution.status == TaskStatus.SUCCEEDED and not execution.evidence_refs:
            raise RuntimeError("AGENT_SUCCESS_WITHOUT_EVIDENCE")
        event = "agent.succeeded" if execution.status == TaskStatus.SUCCEEDED else "agent.blocked" if execution.status in {TaskStatus.BLOCKED, TaskStatus.WAITING_FOR_CLARIFICATION, TaskStatus.WAITING_FOR_FEEDBACK, TaskStatus.WAITING_FOR_SECRET} else "agent.failed"
        return execution, self._trace(context, task, event, execution.status, evidence_refs=execution.evidence_refs, blocked_reason=execution.blocked_reason, changed_files=execution.changed_files)

    @abstractmethod
    def perform(self, context: BuildContext, task: TaskDefinition) -> AgentExecution:
        """Execute this agent's responsibility within the supervisor-approved context."""
        raise NotImplementedError

    def verify(self, execution: AgentExecution) -> bool:
        """A passing result must be an explicit success with non-empty evidence identifiers."""
        return execution.status == TaskStatus.SUCCEEDED and bool(execution.evidence_refs) and not execution.blocked_reason

    def _trace(self, context: BuildContext, task: TaskDefinition, event: str, status: TaskStatus, **payload: Any) -> AgentTrace:
        return AgentTrace(
            trace_id=uuid4().hex,
            run_id=context.run_id,
            agent_id=self.spec.id,
            task_id=task.task_id,
            event=event,
            status=status,
            timestamp_ms=int(time() * 1000),
            selected_reason=task.selected_reason,
            skipped_reason=task.skipped_reason,
            evidence_refs=tuple(payload.pop("evidence_refs", ())),
            payload=payload,
        )
