from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent116DB046(CatalogResponsibilityAgent):
    source_id = "DB-046"
    source_name = "وكيل البحث"
    source_mission = "يبني full-text/filter/ranking"
    source_output = "search contract"
    source_tools = "PostgreSQL FTS، Elasticsearch عند الضرورة"
    source_team = "data"

