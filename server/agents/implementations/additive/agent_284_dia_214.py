from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent284DIA214(CatalogResponsibilityAgent):
    source_id = "DIA-214"
    source_name = "محلل النطاق المتأثر"
    source_mission = "يحدد الصفحات والخدمات والاختبارات التي قد تتأثر"
    source_output = "impact_report"
    source_tools = "dependency graph، repo map"
    source_team = "specialist"

