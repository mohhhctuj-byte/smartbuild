from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent167QA097(CatalogResponsibilityAgent):
    source_id = "QA-097"
    source_name = "وكيل visual regression"
    source_mission = "يقارن screenshots عبر الإصدارات"
    source_output = "visual diff"
    source_tools = "Playwright، pixelmatch"
    source_team = "quality"

