from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent220RT150(CatalogResponsibilityAgent):
    source_id = "RT-150"
    source_name = "مراجع realtime"
    source_mission = "يختبر reconnect/order/duplicates"
    source_output = "realtime gate"
    source_tools = "Playwright، WebSocket client"
    source_team = "specialist"

