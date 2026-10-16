from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent110BE040(CatalogResponsibilityAgent):
    source_id = "BE-040"
    source_name = "مراجع Backend"
    source_mission = "يراجع API وexceptions وtimeouts وcontracts"
    source_output = "backend report"
    source_tools = "pytest، Schemathesis، Ruff"
    source_team = "backend"

