from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent165QA095(CatalogResponsibilityAgent):
    source_id = "QA-095"
    source_name = "وكيل contract tests"
    source_mission = "يقارن frontend/backend schemas"
    source_output = "contract report"
    source_tools = "OpenAPI، Schemathesis"
    source_team = "quality"

