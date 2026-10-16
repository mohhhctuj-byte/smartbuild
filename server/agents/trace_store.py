"""Append-only, server-only JSONL trace store with safe run identifiers."""
from __future__ import annotations

import json
import re
from pathlib import Path

from .agent_specs import AgentTrace


_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


class TraceStore:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or (Path(__file__).resolve().parent / ".traces")
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, run_id: str) -> Path:
        if not _SAFE_ID.fullmatch(run_id):
            raise ValueError("INVALID_TRACE_RUN_ID")
        return self.root / f"{run_id}.jsonl"

    def append(self, trace: AgentTrace) -> str:
        path = self._path(trace.run_id)
        row = {
            "traceId": trace.trace_id, "runId": trace.run_id, "agentId": trace.agent_id, "taskId": trace.task_id,
            "event": trace.event, "status": trace.status.value, "timestampMs": trace.timestamp_ms,
            "selectedReason": trace.selected_reason, "skippedReason": trace.skipped_reason,
            "evidenceRefs": list(trace.evidence_refs), "payload": trace.payload,
        }
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        return str(path)

    def list(self, run_id: str) -> tuple[dict[str, object], ...]:
        path = self._path(run_id)
        if not path.exists():
            return ()
        return tuple(json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
