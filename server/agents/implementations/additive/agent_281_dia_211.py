from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent281DIA211(CatalogResponsibilityAgent):
    source_id = "DIA-211"
    source_name = "كاشف المشكلة"
    source_mission = "يحدد هل الموجود bug أو feature ناقصة أو إعداد خاطئ"
    source_output = "issue_type"
    source_tools = "logs، tests، classifier"
    source_team = "specialist"

