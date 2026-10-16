from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent295VOI225(CatalogResponsibilityAgent):
    source_id = "VOI-225"
    source_name = "مدير البث"
    source_mission = "يدير chunks والـbackpressure وإعادة الاتصال"
    source_output = "stream_state"
    source_tools = "asyncio، Redis، WebSocket"
    source_team = "specialist"

