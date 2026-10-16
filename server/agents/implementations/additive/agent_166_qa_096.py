from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent166QA096(CatalogResponsibilityAgent):
    source_id = "QA-096"
    source_name = "وكيل property/fuzz"
    source_mission = "يبحث عن edge cases غير متوقعة"
    source_output = "fuzz cases"
    source_tools = "Hypothesis، fast-check"
    source_team = "quality"

