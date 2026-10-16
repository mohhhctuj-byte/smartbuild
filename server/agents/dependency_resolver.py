"""Dependency resolution helpers; no dependent task may bypass a failed gate."""
from __future__ import annotations

from .task_graph import GraphNodeStatus, TaskGraph


def dependencies_complete(graph: TaskGraph, task_id: str) -> bool:
    node = graph.nodes[task_id]
    return all(graph.nodes[item].status == GraphNodeStatus.PASS for item in node.task.depends_on)


def blocked_dependents(graph: TaskGraph, task_id: str) -> tuple[str, ...]:
    return tuple(node.task.task_id for node in graph.nodes.values() if task_id in node.task.depends_on and node.status == GraphNodeStatus.BLOCKED)
