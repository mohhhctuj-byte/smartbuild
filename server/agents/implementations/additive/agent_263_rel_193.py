from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent263REL193(CatalogResponsibilityAgent):
    source_id = "REL-193"
    source_name = "مدقق النشر"
    source_mission = "يراجع migrations/env/health قبل وبعد النشر"
    source_output = "deployment verification"
    source_tools = "HTTP checks، SQL checks"
    source_team = "specialist"

