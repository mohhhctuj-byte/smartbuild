from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent118DB048(CatalogResponsibilityAgent):
    source_id = "DB-048"
    source_name = "مدقق جودة البيانات"
    source_mission = "يضع null/range/uniqueness checks"
    source_output = "data quality report"
    source_tools = "Great Expectations أو Pandera"
    source_team = "data"

