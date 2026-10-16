import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from projectRuntime import create_app


class ProjectDataApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        backend = self.root / "backend"
        backend.mkdir()
        (backend / "smartbuild.data-models.json").write_text(
            json.dumps({
                "version": 1,
                "entities": [{"name": "Reservation", "fields": ["id", "guestName", "status", "createdAt"], "requiredFields": ["guestName"]}],
            }),
            encoding="utf-8",
        )
        self.client = TestClient(create_app(self.root, "test-token"))

    def tearDown(self):
        self.temporary.cleanup()

    def test_crud_persists_to_project_sqlite_and_starts_empty(self):
        listed = self.client.get("/api/data/Reservation")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["records"], [])
        self.assertEqual(listed.json()["total"], 0)

        created = self.client.post("/api/data/Reservation", json={"guestName": "Ari", "status": "requested"})
        self.assertEqual(created.status_code, 201)
        record_id = created.json()["id"]
        self.assertEqual(self.client.get(f"/api/data/Reservation/{record_id}").json()["status"], "requested")
        updated = self.client.patch(f"/api/data/Reservation/{record_id}", json={"status": "confirmed"})
        self.assertEqual(updated.json()["status"], "confirmed")

        restarted = TestClient(create_app(self.root, "test-token"))
        self.assertEqual(restarted.get("/api/data/Reservation").json()["records"][0]["status"], "confirmed")
        self.assertEqual(restarted.delete(f"/api/data/Reservation/{record_id}").status_code, 204)
        self.assertEqual(restarted.get("/api/data/Reservation").json()["total"], 0)

    def test_rejects_unknown_entities_fields_and_missing_required_values(self):
        self.assertEqual(self.client.get("/api/data/Unknown").status_code, 404)
        self.assertEqual(self.client.post("/api/data/Reservation", json={"guestName": "Ari", "fakeMetric": 900}).status_code, 422)
        self.assertEqual(self.client.post("/api/data/Reservation", json={"guestName": " "}).status_code, 422)

    def test_database_inspector_requires_internal_token_and_returns_real_paginated_records(self):
        self.assertEqual(self.client.get("/__smartbuild__/database/tables").status_code, 404)
        headers = {"x-smartbuild-test-token": "test-token"}
        response = self.client.get("/__smartbuild__/database/tables", headers=headers)
        self.assertTrue(response.json()["available"])
        tables = response.json()["tables"]
        self.assertEqual(tables, [{
            "name": "Reservation",
            "columns": ["id", "guestName", "status", "createdAt", "updatedAt"],
            "rowCount": 0,
        }])

        for name in ("Ari", "Sam", "Kai"):
            self.assertEqual(self.client.post("/api/data/Reservation", json={"guestName": name}).status_code, 201)

        first_page = self.client.get(
            "/__smartbuild__/database/tables/Reservation?page=1&pageSize=2",
            headers=headers,
        )
        self.assertEqual(first_page.status_code, 200)
        self.assertEqual(first_page.json()["rowCount"], 3)
        self.assertEqual(len(first_page.json()["rows"]), 2)
        self.assertEqual(first_page.json()["page"], 1)
        self.assertEqual(first_page.json()["pageSize"], 2)
        self.assertNotIn("Fake", json.dumps(first_page.json()))
        self.assertEqual(
            self.client.get("/__smartbuild__/database/tables/Unknown", headers=headers).status_code,
            404,
        )

    def test_project_database_survives_a_new_build_workspace(self):
        database_path = self.root / "project-owned-data" / "project.sqlite3"
        self.client = TestClient(create_app(self.root, "test-token", database_path))
        created = self.client.post("/api/data/Reservation", json={"guestName": "Sam"})
        self.assertEqual(created.status_code, 201)

        next_build_root = self.root / "next-build"
        backend = next_build_root / "backend"
        backend.mkdir(parents=True)
        (backend / "smartbuild.data-models.json").write_text(
            (self.root / "backend" / "smartbuild.data-models.json").read_text(encoding="utf-8"),
            encoding="utf-8",
        )
        next_build = TestClient(create_app(next_build_root, "test-token", database_path))
        self.assertEqual(next_build.get("/api/data/Reservation").json()["total"], 1)


if __name__ == "__main__":
    unittest.main()
