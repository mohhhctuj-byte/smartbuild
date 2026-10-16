from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent161QA091(CatalogResponsibilityAgent):
    source_id = "QA-091"
    source_name = "استراتيجي الاختبارات"
    source_mission = "يبني test pyramid ونطاق المخاطر"
    source_output = "test strategy"
    source_tools = "pytest، Vitest، Playwright"
    source_team = "quality"

