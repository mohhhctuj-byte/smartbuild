from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent100FE030(CatalogResponsibilityAgent):
    source_id = "FE-030"
    source_name = "مراجع تكامل الواجهة"
    source_mission = "يشغل type-check وbuild ويراجع contract"
    source_output = "integration report"
    source_tools = "TypeScript، ESLint، Prettier"
    source_team = "frontend"

