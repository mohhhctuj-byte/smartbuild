from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent138AI068(CatalogResponsibilityAgent):
    source_id = "AI-068"
    source_name = "كاشف الهلوسة"
    source_mission = "يقارن claims بالمصادر والعقود"
    source_output = "groundedness report"
    source_tools = "citations، schema validation"
    source_team = "ai"

