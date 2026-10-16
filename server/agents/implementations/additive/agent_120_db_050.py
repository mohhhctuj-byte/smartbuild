from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent120DB050(CatalogResponsibilityAgent):
    source_id = "DB-050"
    source_name = "مراجع قاعدة البيانات"
    source_mission = "يفحص integrity والخصوصية والأداء"
    source_output = "DB review"
    source_tools = "SQL، pytest، EXPLAIN"
    source_team = "data"

