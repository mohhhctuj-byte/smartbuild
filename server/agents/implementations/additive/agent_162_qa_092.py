from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent162QA092(CatalogResponsibilityAgent):
    source_id = "QA-092"
    source_name = "وكيل unit tests"
    source_mission = "يولد اختبارات للدوال والقواعد"
    source_output = "unit test files"
    source_tools = "pytest، Vitest"
    source_team = "quality"

