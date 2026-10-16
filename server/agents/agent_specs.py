"""Typed, provider-neutral contracts shared by SmartBuild specialist agents."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal


class TaskStatus(str, Enum):
    PLANNED = "planned"
    RUNNING = "running"
    BLOCKED = "blocked"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    WAITING_FOR_CLARIFICATION = "waiting_for_clarification"
    WAITING_FOR_SECRET = "waiting_for_secret"
    WAITING_FOR_FEEDBACK = "waiting_for_feedback"


@dataclass(frozen=True)
class ModelProfile:
    profile_id: str
    provider: str
    purpose: str
    reasoning_effort: Literal["low", "medium", "high"] = "medium"
    temperature: float = 0.1
    max_output_tokens: int = 1600
    json_schema_required: bool = True


@dataclass(frozen=True)
class AgentSpec:
    id: str
    name: str
    legacy_module_id: str
    role: str
    team: str
    triggers: tuple[str, ...]
    prerequisites: tuple[str, ...]
    required_inputs: tuple[str, ...]
    produced_artifacts: tuple[str, ...]
    read_scopes: tuple[str, ...]
    write_scopes: tuple[str, ...]
    allowed_tool_scopes: tuple[str, ...]
    allowed_path_scopes: tuple[str, ...]
    resource_locks: tuple[str, ...]
    risk_level: Literal["low", "medium", "high"]
    verification_methods: tuple[str, ...]
    model_profile: str
    requires_secret: bool = False
    requires_human_feedback: bool = False
    source_role_id: str | None = None
    source_tools_summary: str | None = None


@dataclass(frozen=True)
class BuildContext:
    run_id: str
    request: str
    workspace_id: str
    workspace_root: str
    project_id: int | None = None
    conversation_id: int | None = None
    selected_paths: tuple[str, ...] = ()
    granted_tool_scopes: tuple[str, ...] = ()
    granted_permissions: tuple[str, ...] = ()
    available_secrets: tuple[str, ...] = ()
    human_feedback: str | None = None
    dry_run: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class TaskDefinition:
    task_id: str
    agent_id: str
    title: str
    purpose: str
    status: TaskStatus = TaskStatus.PLANNED
    depends_on: tuple[str, ...] = ()
    blocked_by: tuple[str, ...] = ()
    inputs: tuple[str, ...] = ()
    outputs: tuple[str, ...] = ()
    allowed_tool_scopes: tuple[str, ...] = ()
    allowed_path_scopes: tuple[str, ...] = ()
    allowed_read_path_scopes: tuple[str, ...] = ()
    resource_locks: tuple[str, ...] = ()
    verification_methods: tuple[str, ...] = ()
    selected_reason: str = ""
    skipped_reason: str | None = None


@dataclass(frozen=True)
class AgentRunDecision:
    allowed: bool
    status: TaskStatus
    reason: str


@dataclass(frozen=True)
class AgentTrace:
    trace_id: str
    run_id: str
    agent_id: str
    task_id: str
    event: str
    status: TaskStatus
    timestamp_ms: int
    selected_reason: str | None = None
    skipped_reason: str | None = None
    evidence_refs: tuple[str, ...] = ()
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class OrchestrationPlan:
    run_id: str
    request: str
    selected_agents: tuple[AgentSpec, ...]
    skipped_agents: tuple[tuple[str, str], ...]
    tasks: tuple[TaskDefinition, ...]
    traces: tuple[AgentTrace, ...]
    blocked_reason: str | None = None

    @property
    def all_required_tasks_selected(self) -> bool:
        return bool(self.selected_agents) and not self.blocked_reason


def assert_safe_relative_path(path: str) -> None:
    normal = path.replace("\\", "/").strip()
    if not normal or normal.startswith("/") or ".." in normal.split("/"):
        raise ValueError("AGENT_PATH_OUTSIDE_WORKSPACE")
