"""All-PASS rule shared with SmartBuild verified checkpoint logic."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AcceptanceRow:
    criterion: str
    status: str
    evidence_path: str | None
    test_command: str | None
    explanation: str


def can_verify(rows: tuple[AcceptanceRow, ...]) -> bool:
    return bool(rows) and all(row.status == "PASS" for row in rows)


def checkpoint_allowed(rows: tuple[AcceptanceRow, ...]) -> bool:
    return can_verify(rows)
