from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent297VOI227(CatalogResponsibilityAgent):
    source_id = "VOI-227"
    source_name = "مولد الكلام TTS"
    source_mission = "ينشئ صوتًا عربيًا واضحًا مع اختيار سرعة ونبرة"
    source_output = "audio_response"
    source_tools = "TTS provider adapter، SSML"
    source_team = "specialist"

