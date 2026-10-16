from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent248ORC178(CatalogResponsibilityAgent):
    source_id = "ORC-178"
    source_name = "محلل التعارض"
    source_mission = "يشرح التعارض ويقترح حلًا قابلًا للاختبار"
    source_output = "conflict patch"
    source_tools = "Git، AST diff"
    source_team = "specialist"

