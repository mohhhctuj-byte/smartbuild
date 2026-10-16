"""Supervisor planning boundary for the explicit specialist registry."""
from __future__ import annotations

import uuid

try:
    from .agents.registry import AGENT_CLASSES
    from .orchestration import TaskGraph
    from .schemas import AgentContext, TaskSpec
except ImportError:  # pragma: no cover - direct CLI compatibility
    from agents.registry import AGENT_CLASSES
    from orchestration import TaskGraph
    from schemas import AgentContext, TaskSpec


class Supervisor:
    """Plans bounded work; execution remains an explicit caller action."""

    def __init__(self) -> None:
        self.registry = AGENT_CLASSES

    def plan(self, request: str, *, workspace_root: str, project_id: int | None = None, conversation_id: int | None = None) -> tuple[AgentContext, TaskGraph]:
        clean = request.strip()
        if not clean:
            raise ValueError("REQUEST_REQUIRED")
        lower = clean.lower()
        selected: list[tuple[str, str, str]] = [("intent_verifier", "Verify intent", "Clarify and verify the requested outcome.")]
        if any(word in lower for word in ("ui", "design", "page", "component", "frontend")):
            selected.append(("functional_component_engineer", "Wire interface", "Ensure requested UI controls have behavior."))
        if any(word in lower for word in ("database", "api", "backend", "auth")):
            selected.append(("api_designer", "Design contract", "Define the required backend contract."))
        if any(word in lower for word in ("test", "qa", "verify")):
            selected.append(("unit_test_specialist", "Plan tests", "Identify meaningful automated coverage."))
        if len(selected) == 1:
            selected.append(("user_clarifier", "Clarify request", "Ask targeted questions before implementation."))
        tasks = tuple(
            TaskSpec(
                task_id=f"{agent_id}-{index}",
                agent_id=agent_id,
                title=title,
                prompt=clean,
                dependencies=(selected[index - 1][0] + f"-{index - 1}",) if index else (),
                paths=(),
            )
            for index, (agent_id, title, _reason) in enumerate(selected)
        )
        context = AgentContext(run_id=uuid.uuid4().hex, workspace_root=workspace_root, project_id=project_id, conversation_id=conversation_id, supervisor_reason=f"Supervisor selected {len(tasks)} specialist(s) for the request.")
        return context, TaskGraph(tasks)
