from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent291VOI221(CatalogResponsibilityAgent):
    source_id = "VOI-221"
    source_name = "كاشف بداية الكلام"
    source_mission = "يحدد متى بدأ المستخدم ومتى سكت"
    source_output = "speech_segment"
    source_tools = "VAD adapter، Web Audio"
    source_team = "specialist"

