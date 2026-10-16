from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent234CODE164(CatalogResponsibilityAgent):
    source_id = "CODE-164"
    source_name = "وكيل refactor"
    source_mission = "يحسن الكود دون تغيير السلوك"
    source_output = "refactor patch + tests"
    source_tools = "LibCST، ts-morph"
    source_team = "specialist"

