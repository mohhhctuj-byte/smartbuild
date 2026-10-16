"""Veyra's local-first specialist runtime.

The runtime is deliberately provider-agnostic at the orchestration boundary but ships
with one production provider: Manus' OpenAI-compatible built-in LLM proxy. It never
accepts arbitrary agent ids, never writes outside the canonical workspace, and never
runs an agent without a supervisor-issued assignment.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Protocol
import json
import os
import time
import uuid


class RuntimeErrorBase(Exception):
    """Base class for safe, user-facing runtime failures."""


class ProviderBlocked(RuntimeErrorBase):
    pass


class SupervisorDenied(RuntimeErrorBase):
    pass


class UnsafePath(RuntimeErrorBase):
    pass


class RunCancelled(RuntimeErrorBase):
    pass


@dataclass(frozen=True)
class AgentDefinition:
    agent_id: str
    label: str
    category: str
    capabilities: tuple[str, ...]
    allowed_task_kinds: tuple[str, ...]
    requires_file_attribution: bool = False


@dataclass(frozen=True)
class AgentAssignment:
    run_id: str
    agent_id: str
    task_kind: str
    reason: str
    paths: tuple[str, ...] = ()


@dataclass(frozen=True)
class RuntimeEvent:
    event_id: str
    run_id: str
    event_type: str
    agent_id: str
    payload: dict[str, Any]
    created_at_ms: int


class ManusProvider(Protocol):
    name: str

    def complete(self, *, system: str, user: str, reasoning: str = "medium") -> str:
        """Return one bounded completion from the Manus provider."""


class OpenAICompatibleManusProvider:
    """Lazy OpenAI-compatible client backed only by Manus-injected env vars."""

    name = "manus"

    def __init__(self, model: str | None = None) -> None:
        self.model = model or os.environ.get("VEYRA_MANUS_MODEL", "gpt-5")

    def complete(self, *, system: str, user: str, reasoning: str = "medium") -> str:
        api_key = os.environ.get("OPENAI_API_KEY")
        api_base = os.environ.get("OPENAI_API_BASE")
        if not api_key or not api_base:
            raise ProviderBlocked("MANUS_PROVIDER_NOT_CONFIGURED")
        try:
            from openai import OpenAI  # type: ignore
        except ImportError as exc:
            raise ProviderBlocked("PYTHON_OPENAI_SDK_MISSING") from exc
        client = OpenAI(api_key=api_key, base_url=api_base)
        response = client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_completion_tokens=1600,
            extra_body={"reasoning": {"effort": reasoning}},
        )
        content = response.choices[0].message.content
        if not content:
            raise RuntimeErrorBase("MANUS_EMPTY_RESPONSE")
        return content


_CATEGORIES: tuple[tuple[str, tuple[str, ...], tuple[str, ...]], ...] = (
    ("planning", ("decompose", "scope", "acceptance"), ("plan",)),
    ("architecture", ("boundaries", "interfaces", "tradeoffs"), ("plan", "generate")),
    ("frontend", ("react", "accessibility", "responsive-ui"), ("generate", "preview")),
    ("backend", ("api", "validation", "persistence"), ("generate", "test")),
    ("data", ("schema", "migration", "query-safety"), ("generate", "test")),
    ("quality", ("typecheck", "testing", "regression"), ("test",)),
    ("security", ("secrets", "path-safety", "threat-model"), ("plan", "test")),
    ("research", ("sources", "synthesis", "citation"), ("plan", "generate")),
    ("developer-experience", ("tooling", "docs", "automation"), ("generate", "test")),
    ("release", ("preview", "checkpoint", "rollback"), ("preview", "checkpoint")),
)

_NAMES: tuple[str, ...] = (
    "scoper", "acceptance", "requirements", "milestone", "risk", "dependency", "estimator",
    "systems", "api-design", "component-design", "integration", "performance", "reliability", "migration",
    "layout", "interaction", "a11y", "responsive", "visual-qa", "content-ui", "state-ui",
    "api", "auth-boundary", "validation", "storage", "observability", "error-handling", "jobs",
    "schema", "migration-plan", "query", "indexing", "data-integrity", "seed-policy", "backup",
    "typecheck", "unit-test", "integration-test", "e2e-test", "regression", "fixture", "test-review",
    "secret-audit", "path-guard", "dependency-audit", "privacy", "threat-model", "input-safety", "release-security",
    "source-finder", "research-synth", "citation", "fact-check", "web-brief", "comparison", "research-review",
    "tooling", "documentation", "cli", "dev-config", "template", "developer-guide", "automation",
    "preview", "qa-release", "checkpoint", "rollback", "change-log", "artifact-index", "handoff",
)


def _build_registry() -> dict[str, AgentDefinition]:
    definitions: dict[str, AgentDefinition] = {}
    index = 0
    for category, capabilities, kinds in _CATEGORIES:
        for _ in range(7):
            short_name = _NAMES[index]
            agent_id = f"{category}.{short_name}"
            definitions[agent_id] = AgentDefinition(
                agent_id=agent_id,
                label=short_name.replace("-", " ").title(),
                category=category,
                capabilities=capabilities,
                allowed_task_kinds=kinds,
                requires_file_attribution="generate" in kinds,
            )
            index += 1
    if len(definitions) != 70:
        raise AssertionError(f"expected 70 specialists, got {len(definitions)}")
    return definitions


SPECIALIST_REGISTRY: dict[str, AgentDefinition] = _build_registry()


class AgentRegistry:
    def __init__(self, definitions: dict[str, AgentDefinition] | None = None) -> None:
        self._definitions = dict(definitions or SPECIALIST_REGISTRY)

    def list(self) -> tuple[AgentDefinition, ...]:
        return tuple(self._definitions.values())

    def get(self, agent_id: str) -> AgentDefinition:
        try:
            return self._definitions[agent_id]
        except KeyError as exc:
            raise SupervisorDenied("SPECIALIST_NOT_REGISTERED") from exc

    def assign(self, *, agent_id: str, task_kind: str, reason: str, paths: Iterable[str] = ()) -> AgentAssignment:
        definition = self.get(agent_id)
        if task_kind not in definition.allowed_task_kinds:
            raise SupervisorDenied("SPECIALIST_NOT_ALLOWED_FOR_TASK")
        clean_paths = tuple(dict.fromkeys(str(path).strip() for path in paths if str(path).strip()))
        if definition.requires_file_attribution and not clean_paths:
            raise SupervisorDenied("FILE_ATTRIBUTION_REQUIRED")
        if not reason.strip():
            raise SupervisorDenied("SUPERVISOR_REASON_REQUIRED")
        return AgentAssignment(
            run_id=uuid.uuid4().hex,
            agent_id=agent_id,
            task_kind=task_kind,
            reason=reason.strip(),
            paths=clean_paths,
        )


class WorkspacePathGuard:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).expanduser().resolve()

    def resolve_many(self, paths: Iterable[str]) -> tuple[Path, ...]:
        resolved: list[Path] = []
        for raw in paths:
            relative = PurePosixPath(str(raw).strip())
            if not str(relative) or relative.is_absolute() or ".." in relative.parts:
                raise UnsafePath("PATH_OUTSIDE_CANONICAL_WORKSPACE")
            candidate = (self.root / Path(*relative.parts)).resolve()
            if candidate != self.root and self.root not in candidate.parents:
                raise UnsafePath("PATH_OUTSIDE_CANONICAL_WORKSPACE")
            resolved.append(candidate)
        return tuple(resolved)


class AgentRuntime:
    """Supervisor-only runner. It records append-only events and supports cancellation."""

    def __init__(self, workspace_root: str | Path, provider: ManusProvider | None = None, registry: AgentRegistry | None = None) -> None:
        self.paths = WorkspacePathGuard(workspace_root)
        self.provider = provider or OpenAICompatibleManusProvider()
        self.registry = registry or AgentRegistry()
        self.events: list[RuntimeEvent] = []
        self.cancelled_runs: set[str] = set()

    def cancel(self, run_id: str) -> None:
        self.cancelled_runs.add(run_id)

    def run(self, assignment: AgentAssignment, *, prompt: str, system: str) -> str:
        self.registry.get(assignment.agent_id)
        self.paths.resolve_many(assignment.paths)
        if assignment.run_id in self.cancelled_runs:
            raise RunCancelled("RUN_CANCELLED")
        self._event(assignment, "agent.started", {"provider": self.provider.name, "paths": list(assignment.paths)})
        try:
            result = self.provider.complete(system=system, user=prompt)
            if assignment.run_id in self.cancelled_runs:
                raise RunCancelled("RUN_CANCELLED")
            self._event(assignment, "agent.completed", {"result_chars": len(result), "paths": list(assignment.paths)})
            return result
        except Exception as exc:
            self._event(assignment, "agent.failed", {"error": type(exc).__name__})
            raise

    def export_events(self) -> str:
        return json.dumps([event.__dict__ for event in self.events], sort_keys=True)

    def _event(self, assignment: AgentAssignment, event_type: str, payload: dict[str, Any]) -> None:
        self.events.append(RuntimeEvent(
            event_id=uuid.uuid4().hex,
            run_id=assignment.run_id,
            event_type=event_type,
            agent_id=assignment.agent_id,
            payload=payload,
            created_at_ms=int(time.time() * 1000),
        ))
