from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent245ORC175(CatalogResponsibilityAgent):
    source_id = "ORC-175"
    source_name = "مدير السياق"
    source_mission = "يختار أقل سياق كافٍ ويمنع التضخم"
    source_output = "context pack"
    source_tools = "token counter، retrieval"
    source_team = "specialist"

