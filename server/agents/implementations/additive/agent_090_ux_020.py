from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent090UX020(CatalogResponsibilityAgent):
    source_id = "UX-020"
    source_name = "ناقد UX"
    source_mission = "يراجع التدفقات بحثًا عن الاحتكاك"
    source_output = "UX critique مع إصلاحات"
    source_tools = "Playwright، screenshots"
    source_team = "ux"

