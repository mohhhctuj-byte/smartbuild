"""Typed dependency graph for a single supervisor-owned build run."""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import Enum
from time import time

from .agent_specs import TaskDefinition


class GraphNodeStatus(str, Enum):
    PENDING = "PENDING"
    READY = "READY"
    RUNNING = "RUNNING"
    PASS = "PASS"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"
    NEEDS_USER_INPUT = "NEEDS_USER_INPUT"
    SKIPPED = "SKIPPED"


@dataclass(frozen=True)
class GraphNode:
    task: TaskDefinition
    status: GraphNodeStatus = GraphNodeStatus.PENDING
    evidence: tuple[str, ...] = ()
    started_at_ms: int | None = None
    completed_at_ms: int | None = None
    blocked_reason: str | None = None


@dataclass
class TaskGraph:
    run_id: str
    nodes: dict[str, GraphNode] = field(default_factory=dict)

    def add(self, task: TaskDefinition) -> None:
        if task.task_id in self.nodes:
            raise ValueError("DUPLICATE_TASK_ID")
        unknown = set(task.depends_on) - set(self.nodes)
        if unknown:
            raise ValueError(f"UNKNOWN_DEPENDENCY:{','.join(sorted(unknown))}")
        self.nodes[task.task_id] = GraphNode(task=task)
        self.refresh_ready()

    def refresh_ready(self) -> None:
        for key, node in tuple(self.nodes.items()):
            if node.status != GraphNodeStatus.PENDING:
                continue
            dependency_nodes = tuple(self.nodes[dependency] for dependency in node.task.depends_on)
            if any(item.status in {GraphNodeStatus.FAILED, GraphNodeStatus.BLOCKED, GraphNodeStatus.NEEDS_USER_INPUT} for item in dependency_nodes):
                self.nodes[key] = replace(node, status=GraphNodeStatus.BLOCKED, blocked_reason="DEPENDENCY_NOT_PASS")
            elif all(item.status == GraphNodeStatus.PASS for item in dependency_nodes):
                self.nodes[key] = replace(node, status=GraphNodeStatus.READY)

    def next_ready(self) -> GraphNode | None:
        ready = [node for node in self.nodes.values() if node.status == GraphNodeStatus.READY]
        return ready[0] if ready else None

    def mark_running(self, task_id: str) -> GraphNode:
        node = self.nodes[task_id]
        if node.status != GraphNodeStatus.READY:
            raise ValueError("TASK_NOT_READY")
        updated = replace(node, status=GraphNodeStatus.RUNNING, started_at_ms=int(time() * 1000))
        self.nodes[task_id] = updated
        return updated

    def complete(self, task_id: str, status: GraphNodeStatus, evidence: tuple[str, ...] = (), reason: str | None = None) -> GraphNode:
        if status not in {GraphNodeStatus.PASS, GraphNodeStatus.FAILED, GraphNodeStatus.BLOCKED, GraphNodeStatus.NEEDS_USER_INPUT, GraphNodeStatus.SKIPPED}:
            raise ValueError("INVALID_TERMINAL_STATUS")
        node = self.nodes[task_id]
        if node.status not in {GraphNodeStatus.RUNNING, GraphNodeStatus.READY, GraphNodeStatus.PENDING}:
            raise ValueError("TASK_ALREADY_TERMINAL")
        updated = replace(node, status=status, evidence=evidence, completed_at_ms=int(time() * 1000), blocked_reason=reason)
        self.nodes[task_id] = updated
        self.refresh_ready()
        return updated

    def as_dict(self) -> dict[str, object]:
        return {"runId": self.run_id, "nodes": [{"taskId": node.task.task_id, "agentId": node.task.agent_id, "title": node.task.title, "status": node.status.value, "dependsOn": node.task.depends_on, "locks": node.task.resource_locks, "evidence": node.evidence, "blockedReason": node.blocked_reason} for node in self.nodes.values()]}
