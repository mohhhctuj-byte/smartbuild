from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent300VOI230(CatalogResponsibilityAgent):
    source_id = "VOI-230"
    source_name = "مراجع تجربة الصوت"
    source_mission = "يختبر الفهم، المقاطعة، التوقف، وإعادة الاتصال"
    source_output = "voice_release_gate"
    source_tools = "browser audio tests، Playwright"
    source_team = "specialist"

