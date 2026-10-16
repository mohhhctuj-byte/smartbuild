"""SmartBuild's constrained project-scoped FastAPI runtime.

The runner deliberately loads a small declarative route manifest instead of
executing arbitrary generated Python. This keeps a browser-editable project
from obtaining host filesystem, process, or secret access while still allowing
the verified build templates to expose real, project-local API routes.
"""

from __future__ import annotations

import argparse
import hmac
import json
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import uvicorn
from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field, field_validator


CONTACT_MIGRATION = """CREATE TABLE IF NOT EXISTS contact_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);"""
CONTACT_ROUTE = {"method": "POST", "path": "/api/contact", "handler": "contact_submission"}
DATA_MODEL_FILE = Path("backend") / "smartbuild.data-models.json"
ENTITY_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")
FIELD_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")


class ContactSubmission(BaseModel):
    name: Annotated[str, Field(min_length=2, max_length=120)]
    email: Annotated[str, Field(min_length=5, max_length=254)]
    message: Annotated[str, Field(min_length=3, max_length=4000)]

    @field_validator("name", "email", "message")
    @classmethod
    def strip_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This field is required.")
        return cleaned

    @field_validator("email")
    @classmethod
    def email_address(cls, value: str) -> str:
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address.")
        return value.lower()


def safe_project_root(raw_root: str) -> Path:
    root = Path(raw_root).resolve()
    if not root.is_dir():
        raise RuntimeError("PROJECT_RUNTIME_WORKSPACE_UNAVAILABLE")
    return root


def load_contact_contract(root: Path) -> bool:
    manifest_path = root / "backend" / "smartbuild.routes.json"
    migration_path = root / "backend" / "migrations" / "001-contact-submissions.sql"
    if not manifest_path.is_file() and not migration_path.is_file():
        return False
    if not manifest_path.is_file() or not migration_path.is_file():
        raise RuntimeError("PROJECT_RUNTIME_CONTRACT_MISSING")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError("PROJECT_RUNTIME_CONTRACT_INVALID") from error
    if manifest != {"version": 1, "routes": [CONTACT_ROUTE], "migrations": ["001-contact-submissions.sql"]}:
        raise RuntimeError("PROJECT_RUNTIME_CONTRACT_UNSUPPORTED")
    if migration_path.read_text(encoding="utf-8").strip() != CONTACT_MIGRATION.strip():
        raise RuntimeError("PROJECT_RUNTIME_MIGRATION_UNSUPPORTED")
    return True


def load_data_models(root: Path) -> dict[str, dict[str, object]]:
    manifest_path = root / DATA_MODEL_FILE
    if not manifest_path.is_file():
        return {}
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError("PROJECT_DATA_MODELS_INVALID") from error
    if not isinstance(manifest, dict) or manifest.get("version") != 1 or not isinstance(manifest.get("entities"), list):
        raise RuntimeError("PROJECT_DATA_MODELS_INVALID")
    models: dict[str, dict[str, object]] = {}
    for entity in manifest["entities"]:
        if not isinstance(entity, dict):
            raise RuntimeError("PROJECT_DATA_MODELS_INVALID")
        name = entity.get("name")
        fields = entity.get("fields")
        required_fields = entity.get("requiredFields", [])
        if (
            not isinstance(name, str)
            or not ENTITY_NAME.fullmatch(name)
            or name in models
            or not isinstance(fields, list)
            or not fields
            or not isinstance(required_fields, list)
            or any(not isinstance(field, str) or not FIELD_NAME.fullmatch(field) for field in fields)
            or len(set(fields)) != len(fields)
            or any(field not in fields for field in required_fields)
            or any(field in {"id", "createdAt", "updatedAt"} for field in required_fields)
        ):
            raise RuntimeError("PROJECT_DATA_MODELS_INVALID")
        models[name] = {"fields": fields, "requiredFields": required_fields}
    if not models:
        raise RuntimeError("PROJECT_DATA_MODELS_INVALID")
    return models


@contextmanager
def connect(database_path: Path):
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def apply_migrations(
    root: Path,
    has_contact: bool,
    data_models: dict[str, dict[str, object]],
    persistent_database_path: Path | None = None,
) -> Path:
    runtime_dir = persistent_database_path.parent if persistent_database_path else root / ".smartbuild-runtime"
    runtime_dir.mkdir(mode=0o700, exist_ok=True)
    database_path = persistent_database_path or runtime_dir / "project.sqlite3"
    with connect(database_path) as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS smartbuild_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
        )
        if has_contact:
            applied = connection.execute(
                "SELECT 1 FROM smartbuild_migrations WHERE id = ?", ("001-contact-submissions.sql",)
            ).fetchone()
            if not applied:
                connection.executescript(CONTACT_MIGRATION)
                connection.execute(
                    "INSERT INTO smartbuild_migrations (id, applied_at) VALUES (?, ?)",
                    ("001-contact-submissions.sql", datetime.now(timezone.utc).isoformat()),
                )
        if data_models:
            connection.execute(
                """CREATE TABLE IF NOT EXISTS project_records (
                    entity TEXT NOT NULL,
                    record_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (entity, record_id)
                )"""
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS project_records_entity_updated ON project_records(entity, updated_at)"
            )
            applied = connection.execute(
                "SELECT 1 FROM smartbuild_migrations WHERE id = ?", ("001-project-records",)
            ).fetchone()
            if not applied:
                connection.execute(
                    "INSERT INTO smartbuild_migrations (id, applied_at) VALUES (?, ?)",
                    ("001-project-records", datetime.now(timezone.utc).isoformat()),
                )
    return database_path


def create_app(root: Path, test_token: str, persistent_database_path: Path | None = None) -> FastAPI:
    has_contact = load_contact_contract(root)
    data_models = load_data_models(root)
    if not has_contact and not data_models:
        raise RuntimeError("PROJECT_RUNTIME_CONTRACT_MISSING")
    database_path = apply_migrations(root, has_contact, data_models, persistent_database_path)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/__smartbuild__/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "runtime": "fastapi", "database": "sqlite"}

    def require_internal_token(x_smartbuild_test_token: str | None) -> None:
        if not test_token or not x_smartbuild_test_token or not hmac.compare_digest(test_token, x_smartbuild_test_token):
            raise HTTPException(status_code=404, detail="Not found")

    def database_table_specs() -> list[dict[str, object]]:
        tables = [
            {
                "name": entity,
                "columns": list(dict.fromkeys([*model["fields"], "createdAt", "updatedAt"])),
            }
            for entity, model in data_models.items()
        ]
        if has_contact:
            tables.append({
                "name": "contact_submissions",
                "columns": ["id", "name", "email", "message", "created_at"],
            })
        return tables

    @app.get("/__smartbuild__/database/tables")
    def inspect_database_tables(
        x_smartbuild_test_token: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        require_internal_token(x_smartbuild_test_token)
        with connect(database_path) as connection:
            tables = []
            for table in database_table_specs():
                if table["name"] == "contact_submissions":
                    count = connection.execute("SELECT COUNT(*) FROM contact_submissions").fetchone()[0]
                else:
                    count = connection.execute(
                        "SELECT COUNT(*) FROM project_records WHERE entity = ?", (table["name"],)
                    ).fetchone()[0]
                tables.append({**table, "rowCount": count})
        return {"available": True, "database": "sqlite", "tables": tables}

    @app.get("/__smartbuild__/database/tables/{table_name}")
    def inspect_database_table(
        table_name: str,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 50,
        x_smartbuild_test_token: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        require_internal_token(x_smartbuild_test_token)
        table = next((item for item in database_table_specs() if item["name"] == table_name), None)
        if table is None:
            raise HTTPException(status_code=404, detail="Table not found.")
        offset = (page - 1) * page_size
        with connect(database_path) as connection:
            if table_name == "contact_submissions":
                row_count = connection.execute("SELECT COUNT(*) FROM contact_submissions").fetchone()[0]
                rows = connection.execute(
                    "SELECT id, name, email, message, created_at FROM contact_submissions ORDER BY id LIMIT ? OFFSET ?",
                    (page_size, offset),
                ).fetchall()
                records = [dict(row) for row in rows]
            else:
                row_count = connection.execute(
                    "SELECT COUNT(*) FROM project_records WHERE entity = ?", (table_name,)
                ).fetchone()[0]
                rows = connection.execute(
                    "SELECT record_id, payload, created_at, updated_at FROM project_records "
                    "WHERE entity = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                    (table_name, page_size, offset),
                ).fetchall()
                records = [
                    {
                        "id": row["record_id"],
                        **json.loads(row["payload"]),
                        "createdAt": row["created_at"],
                        "updatedAt": row["updated_at"],
                    }
                    for row in rows
                ]
        return {
            "table": table_name,
            "columns": table["columns"],
            "rows": records,
            "rowCount": row_count,
            "page": page,
            "pageSize": page_size,
        }

    if has_contact:
        @app.post("/api/contact", status_code=201)
        def submit_contact(submission: ContactSubmission) -> dict[str, object]:
            created_at = datetime.now(timezone.utc).isoformat()
            with connect(database_path) as connection:
                cursor = connection.execute(
                    "INSERT INTO contact_submissions (name, email, message, created_at) VALUES (?, ?, ?, ?)",
                    (submission.name, submission.email, submission.message, created_at),
                )
                submission_id = int(cursor.lastrowid)
            return {"ok": True, "submissionId": submission_id, "createdAt": created_at}

    @app.get("/api/data/{entity}")
    def list_records(entity: str, q: Annotated[str, Query(max_length=200)] = "") -> dict[str, object]:
        model = data_models.get(entity)
        if model is None:
            raise HTTPException(status_code=404, detail="Entity not found.")
        with connect(database_path) as connection:
            rows = connection.execute(
                "SELECT record_id, payload, created_at, updated_at FROM project_records WHERE entity = ? ORDER BY updated_at DESC",
                (entity,),
            ).fetchall()
        records = [
            {"id": row["record_id"], **json.loads(row["payload"]), "createdAt": row["created_at"], "updatedAt": row["updated_at"]}
            for row in rows
        ]
        if q:
            folded_query = q.casefold()
            records = [record for record in records if folded_query in json.dumps(record, ensure_ascii=False).casefold()]
        return {"entity": entity, "records": records, "total": len(records)}

    @app.post("/api/data/{entity}", status_code=201)
    def create_record(entity: str, payload: dict[str, object]) -> dict[str, object]:
        model = data_models.get(entity)
        if model is None:
            raise HTTPException(status_code=404, detail="Entity not found.")
        fields = set(model["fields"]) - {"id", "createdAt", "updatedAt"}
        if not payload or set(payload) - fields:
            raise HTTPException(status_code=422, detail="Record contains unsupported fields.")
        missing = set(model["requiredFields"]) - {key for key, value in payload.items() if value is not None and str(value).strip()}
        if missing:
            raise HTTPException(status_code=422, detail=f"Missing required fields: {', '.join(sorted(missing))}.")
        record_id = uuid.uuid4().hex
        timestamp = datetime.now(timezone.utc).isoformat()
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        with connect(database_path) as connection:
            connection.execute(
                "INSERT INTO project_records (entity, record_id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (entity, record_id, encoded, timestamp, timestamp),
            )
        return {"id": record_id, **payload, "createdAt": timestamp, "updatedAt": timestamp}

    @app.get("/api/data/{entity}/{record_id}")
    def get_record(entity: str, record_id: str) -> dict[str, object]:
        if entity not in data_models:
            raise HTTPException(status_code=404, detail="Entity not found.")
        with connect(database_path) as connection:
            row = connection.execute(
                "SELECT payload, created_at, updated_at FROM project_records WHERE entity = ? AND record_id = ?",
                (entity, record_id),
            ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Record not found.")
        return {"id": record_id, **json.loads(row["payload"]), "createdAt": row["created_at"], "updatedAt": row["updated_at"]}

    @app.patch("/api/data/{entity}/{record_id}")
    @app.put("/api/data/{entity}/{record_id}")
    def update_record(entity: str, record_id: str, payload: dict[str, object]) -> dict[str, object]:
        model = data_models.get(entity)
        if model is None:
            raise HTTPException(status_code=404, detail="Entity not found.")
        fields = set(model["fields"]) - {"id", "createdAt", "updatedAt"}
        if not payload or set(payload) - fields:
            raise HTTPException(status_code=422, detail="Record contains unsupported fields.")
        with connect(database_path) as connection:
            row = connection.execute(
                "SELECT payload, created_at FROM project_records WHERE entity = ? AND record_id = ?",
                (entity, record_id),
            ).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Record not found.")
            updated = {**json.loads(row["payload"]), **payload}
            missing = set(model["requiredFields"]) - {key for key, value in updated.items() if value is not None and str(value).strip()}
            if missing:
                raise HTTPException(status_code=422, detail=f"Missing required fields: {', '.join(sorted(missing))}.")
            timestamp = datetime.now(timezone.utc).isoformat()
            connection.execute(
                "UPDATE project_records SET payload = ?, updated_at = ? WHERE entity = ? AND record_id = ?",
                (json.dumps(updated, ensure_ascii=False, separators=(",", ":")), timestamp, entity, record_id),
            )
        return {"id": record_id, **updated, "createdAt": row["created_at"], "updatedAt": timestamp}

    @app.delete("/api/data/{entity}/{record_id}", status_code=204)
    def delete_record(entity: str, record_id: str) -> None:
        if entity not in data_models:
            raise HTTPException(status_code=404, detail="Entity not found.")
        with connect(database_path) as connection:
            cursor = connection.execute(
                "DELETE FROM project_records WHERE entity = ? AND record_id = ?",
                (entity, record_id),
            )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Record not found.")

    if has_contact:
        @app.get("/api/__test__/contact-submissions")
        def inspect_submissions(x_smartbuild_test_token: Annotated[str | None, Header()] = None) -> dict[str, object]:
            if not test_token or not x_smartbuild_test_token or not hmac.compare_digest(test_token, x_smartbuild_test_token):
                raise HTTPException(status_code=404, detail="Not found")
            with connect(database_path) as connection:
                rows = connection.execute(
                    "SELECT id, name, email, message, created_at FROM contact_submissions ORDER BY id ASC"
                ).fetchall()
            return {"count": len(rows), "submissions": [dict(row) for row in rows]}

    return app


def main() -> None:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--test-token", required=True)
    parser.add_argument("--database", type=Path)
    arguments = parser.parse_args()
    application = create_app(safe_project_root(arguments.workspace), arguments.test_token, arguments.database)
    uvicorn.run(application, host="127.0.0.1", port=arguments.port, log_level="warning")


if __name__ == "__main__":
    main()
