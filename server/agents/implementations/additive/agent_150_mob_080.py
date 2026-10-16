from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent150MOB080(CatalogResponsibilityAgent):
    source_id = "MOB-080"
    source_name = "مراجع Mobile"
    source_mission = "يختبر أجهزة وأحجامًا وحالات offline"
    source_output = "mobile QA report"
    source_tools = "Detox أو Maestro، screenshots"
    source_team = "specialist"

