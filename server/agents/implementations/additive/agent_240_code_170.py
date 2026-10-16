from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent240CODE170(CatalogResponsibilityAgent):
    source_id = "CODE-170"
    source_name = "مراجع الكود"
    source_mission = "يراجع diff والمنطق والاختبارات"
    source_output = "code review decision"
    source_tools = "Git diff، tests، policy"
    source_team = "specialist"

