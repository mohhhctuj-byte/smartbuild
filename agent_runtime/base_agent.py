"""Abstract contract shared by every explicit Veyra specialist module."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

try:
    from .schemas import AgentContext, AgentResult, TaskSpec, ValidationResult
except ImportError:  # pragma: no cover - direct CLI compatibility
    from schemas import AgentContext, AgentResult, TaskSpec, ValidationResult


class BaseAgent(ABC):
    """A specialist is inert until the Supervisor supplies a TaskSpec and context."""

    agent_id: str
    name: str
    description: str
    team: str
    capabilities: tuple[str, ...] = ()
    required_tools: tuple[str, ...] = ()
    required_permissions: tuple[str, ...] = ()
    input_schema: dict[str, Any] = {}
    output_schema: dict[str, Any] = {}
    dependencies: tuple[str, ...] = ()
    high_risk: bool = False

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        required = ("agent_id", "name", "description", "team")
        missing = tuple(field for field in required if not getattr(cls, field, None))
        if missing:
            raise TypeError(f"agent metadata required: {', '.join(missing)}")

    @abstractmethod
    async def run(self, context: AgentContext, task: TaskSpec) -> AgentResult:
        """Execute one bounded task; never start autonomous work from this method."""

    def validate_output(self, result: AgentResult) -> ValidationResult:
        if result.agent_id != self.agent_id:
            return ValidationResult(valid=False, errors=("AGENT_ID_MISMATCH",))
        if result.status == "completed" and not result.summary.strip():
            return ValidationResult(valid=False, errors=("COMPLETED_RESULT_NEEDS_SUMMARY",))
        if result.status == "blocked" and not result.blocked_reason:
            return ValidationResult(valid=False, errors=("BLOCKED_RESULT_NEEDS_REASON",))
        return ValidationResult(valid=True, checks=("base-contract",))

    def explain(self) -> dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "description": self.description,
            "team": self.team,
            "capabilities": list(self.capabilities),
            "required_tools": list(self.required_tools),
            "required_permissions": list(self.required_permissions),
            "dependencies": list(self.dependencies),
            "high_risk": self.high_risk,
        }
