from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent182A11Y112(CatalogResponsibilityAgent):
    source_id = "A11Y-112"
    source_name = "وكيل قارئ الشاشة"
    source_mission = "يراجع semantics وlabels وannouncements"
    source_output = "screen-reader findings"
    source_tools = "ARIA، Playwright"
    source_team = "specialist"

