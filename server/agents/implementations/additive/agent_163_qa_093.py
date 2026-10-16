from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent163QA093(CatalogResponsibilityAgent):
    source_id = "QA-093"
    source_name = "وكيل integration tests"
    source_mission = "يختبر DB/API/external adapters"
    source_output = "integration suite"
    source_tools = "Testcontainers عند توفرها، httpx"
    source_team = "quality"

