from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent113DB043(CatalogResponsibilityAgent):
    source_id = "DB-043"
    source_name = "محسن الاستعلامات"
    source_mission = "يراجع joins والفهارس وN+1"
    source_output = "query plan"
    source_tools = "PostgreSQL EXPLAIN"
    source_team = "data"

