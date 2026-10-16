"""Bounded SQLite project memory for runtime metadata, never secret material."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


class ProjectMemory:
    def __init__(self, database_path: str | Path) -> None:
        self.path = Path(database_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path)
        self.connection.execute("CREATE TABLE IF NOT EXISTS runtime_memory (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL)")
        self.connection.commit()

    def append(self, kind: str, payload: dict[str, Any], created_at: int) -> None:
        if not kind.strip():
            raise ValueError("MEMORY_KIND_REQUIRED")
        serialized = json.dumps(payload, sort_keys=True)
        if any(secret in serialized.lower() for secret in ("api_key", "authorization", "bearer ", "password")):
            raise ValueError("SECRET_MATERIAL_NOT_ALLOWED_IN_MEMORY")
        self.connection.execute("INSERT INTO runtime_memory(kind, payload, created_at) VALUES (?, ?, ?)", (kind, serialized, created_at))
        self.connection.commit()

    def list(self, kind: str | None = None) -> list[dict[str, Any]]:
        if kind:
            rows = self.connection.execute("SELECT kind, payload, created_at FROM runtime_memory WHERE kind = ? ORDER BY id", (kind,)).fetchall()
        else:
            rows = self.connection.execute("SELECT kind, payload, created_at FROM runtime_memory ORDER BY id").fetchall()
        return [{"kind": row[0], "payload": json.loads(row[1]), "created_at": row[2]} for row in rows]

    def close(self) -> None:
        self.connection.close()
