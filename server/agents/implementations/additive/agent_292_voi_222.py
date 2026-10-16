from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent292VOI222(CatalogResponsibilityAgent):
    source_id = "VOI-222"
    source_name = "مفرغ الصوت STT"
    source_mission = "يحول المصري والإنجليزية المختلطة إلى نص مع timestamps"
    source_output = "transcript"
    source_tools = "STT provider adapter، WebSocket"
    source_team = "specialist"

