from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent230ANA160(CatalogResponsibilityAgent):
    source_id = "ANA-160"
    source_name = "مراجع التحليلات"
    source_mission = "يراجع دقة الأحداث وعدم تسريب PII"
    source_output = "analytics gate"
    source_tools = "event tests، privacy rules"
    source_team = "specialist"

