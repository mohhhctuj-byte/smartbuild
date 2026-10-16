from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent294VOI224(CatalogResponsibilityAgent):
    source_id = "VOI-224"
    source_name = "كاشف المقاطعة"
    source_mission = "يوقف الرد الصوتي عندما يبدأ المستخدم كلامًا جديدًا"
    source_output = "barge_in_event"
    source_tools = "WebSocket/WebRTC adapter"
    source_team = "specialist"

