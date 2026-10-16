"""Supervisor-gated asynchronous orchestration primitives for Veyra."""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass
from typing import Any

try:
    from .schemas import AgentContext, AgentResult, AgentStatus, ApprovalRequest, ExecutionPolicy, TaskSpec
    from .base_agent import BaseAgent
except ImportError:  # pragma: no cover - direct CLI compatibility
    from schemas import AgentContext, AgentResult, AgentStatus, ApprovalRequest, ExecutionPolicy, TaskSpec
    from base_agent import BaseAgent


@dataclass(frozen=True)
class RuntimeProgress:
    event_id: str
    event_type: str
    task_id: str
    agent_id: str
    payload: dict[str, Any]
    created_at_ms: int


class EventBus:
    def __init__(self) -> None:
        self._events: list[RuntimeProgress] = []
        self._queue: asyncio.Queue[RuntimeProgress] = asyncio.Queue()

    async def publish(self, event_type: str, task: TaskSpec, payload: dict[str, Any]) -> RuntimeProgress:
        event = RuntimeProgress(uuid.uuid4().hex, event_type, task.task_id, task.agent_id, payload, int(time.time() * 1000))
        self._events.append(event)
        await self._queue.put(event)
        return event

    async def next(self) -> RuntimeProgress:
        return await self._queue.get()

    @property
    def events(self) -> tuple[RuntimeProgress, ...]:
        return tuple(self._events)


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, tuple[Any, frozenset[str]]] = {}

    def register(self, name: str, handler: Any, permissions: tuple[str, ...] = ()) -> None:
        if not name.strip():
            raise ValueError("TOOL_NAME_REQUIRED")
        self._tools[name] = (handler, frozenset(permissions))

    def get_authorized(self, name: str, policy: ExecutionPolicy) -> Any:
        try:
            handler, required = self._tools[name]
        except KeyError as exc:
            raise PermissionError("TOOL_NOT_REGISTERED") from exc
        if not required.issubset(set(policy.allowed_permissions)):
            raise PermissionError("TOOL_PERMISSION_DENIED")
        return handler


class ApprovalGate:
    def require(self, task: TaskSpec, policy: ExecutionPolicy, approval: ApprovalRequest | None = None) -> None:
        if not task.high_risk or not policy.require_approval_for_high_risk:
            return
        if approval is None or not approval.approved:
            raise PermissionError("APPROVAL_REQUIRED")


class TaskGraph:
    def __init__(self, tasks: tuple[TaskSpec, ...]) -> None:
        self.tasks = {task.task_id: task for task in tasks}
        if len(self.tasks) != len(tasks):
            raise ValueError("DUPLICATE_TASK_ID")
        for task in tasks:
            unknown = set(task.dependencies) - set(self.tasks)
            if unknown:
                raise ValueError(f"UNKNOWN_DEPENDENCY:{sorted(unknown)}")

    def ready(self, completed: set[str], running: set[str]) -> tuple[TaskSpec, ...]:
        return tuple(task for task in self.tasks.values() if task.task_id not in completed and task.task_id not in running and set(task.dependencies).issubset(completed))


class TaskExecutor:
    def __init__(self, agents: dict[str, BaseAgent], *, policy: ExecutionPolicy | None = None, events: EventBus | None = None, approvals: dict[str, ApprovalRequest] | None = None) -> None:
        self.agents = agents
        self.policy = policy or ExecutionPolicy()
        self.events = events or EventBus()
        self.approvals = approvals or {}
        self.cancelled = False

    def cancel(self) -> None:
        self.cancelled = True

    async def execute(self, graph: TaskGraph, context: AgentContext) -> dict[str, AgentResult]:
        results: dict[str, AgentResult] = {}
        completed: set[str] = set()
        running: set[str] = set()
        pending = set(graph.tasks)
        while pending:
            if self.cancelled:
                for task_id in pending:
                    task = graph.tasks[task_id]
                    results[task_id] = AgentResult(status=AgentStatus.CANCELLED, agent_id=task.agent_id, run_id=context.run_id, summary="Cancelled before execution.")
                break
            ready = graph.ready(completed, running)
            if not ready:
                if pending:
                    raise RuntimeError("TASK_GRAPH_DEADLOCK")
                break
            running.update(task.task_id for task in ready)
            batch = await asyncio.gather(*(self._execute_one(task, context) for task in ready))
            for task, result in zip(ready, batch):
                results[task.task_id] = result
                running.discard(task.task_id)
                pending.discard(task.task_id)
                if result.status == AgentStatus.COMPLETED:
                    completed.add(task.task_id)
                else:
                    for blocked_id in pending:
                        if task.task_id in graph.tasks[blocked_id].dependencies:
                            blocked = graph.tasks[blocked_id]
                            results[blocked_id] = AgentResult(status=AgentStatus.BLOCKED, agent_id=blocked.agent_id, run_id=context.run_id, blocked_reason=f"DEPENDENCY_BLOCKED:{task.task_id}")
                    pending = {task_id for task_id in pending if task_id not in results}
        return results

    async def _execute_one(self, task: TaskSpec, context: AgentContext) -> AgentResult:
        agent = self.agents.get(task.agent_id)
        if agent is None:
            return AgentResult(status=AgentStatus.BLOCKED, agent_id=task.agent_id, run_id=context.run_id, blocked_reason="AGENT_NOT_REGISTERED")
        try:
            ApprovalGate().require(task, self.policy, self.approvals.get(task.task_id))
            missing_tools = set(task.required_tools) - set(self.policy.allowed_tools)
            missing_permissions = set(task.required_permissions) - set(self.policy.allowed_permissions)
            if missing_tools or missing_permissions:
                raise PermissionError("EXECUTION_SCOPE_DENIED")
        except PermissionError as exc:
            return AgentResult(status=AgentStatus.BLOCKED, agent_id=task.agent_id, run_id=context.run_id, blocked_reason=str(exc))

        task_context = context.model_copy(update={"dry_run": context.dry_run or self.policy.dry_run or task.dry_run})
        attempts = self.policy.max_retries + 1
        last_failure = "TASK_FAILED"
        for attempt in range(attempts):
            try:
                await self.events.publish("task.running", task, {"attempt": attempt + 1, "max_attempts": attempts, "dry_run": task_context.dry_run})
                result = await asyncio.wait_for(agent.run(task_context, task), timeout=self.policy.timeout_seconds)
                validation = agent.validate_output(result)
                if not validation.valid:
                    last_failure = ";".join(validation.errors) or "OUTPUT_VALIDATION_FAILED"
                    if attempt + 1 < attempts:
                        await self.events.publish("task.retrying", task, {"attempt": attempt + 1, "reason": last_failure})
                        continue
                    return result.model_copy(update={"status": AgentStatus.FAILED, "failure_reason": last_failure})
                await self.events.publish(f"task.{result.status.value}", task, {"summary": result.summary, "blocked_reason": result.blocked_reason, "attempt": attempt + 1})
                return result
            except asyncio.TimeoutError:
                last_failure = "TASK_TIMEOUT"
            except asyncio.CancelledError:
                return AgentResult(status=AgentStatus.CANCELLED, agent_id=task.agent_id, run_id=context.run_id, summary="Task cancelled.")
            except Exception as exc:
                last_failure = type(exc).__name__
            if attempt + 1 < attempts:
                await self.events.publish("task.retrying", task, {"attempt": attempt + 1, "reason": last_failure})
        return AgentResult(status=AgentStatus.FAILED, agent_id=task.agent_id, run_id=context.run_id, failure_reason=last_failure)
