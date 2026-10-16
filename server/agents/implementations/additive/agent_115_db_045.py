from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent115DB045(CatalogResponsibilityAgent):
    source_id = "DB-045"
    source_name = "وكيل vector data"
    source_mission = "يحدد embeddings وchunking وmetadata"
    source_output = "vector schema"
    source_tools = "pgvector، embedding API"
    source_team = "data"

