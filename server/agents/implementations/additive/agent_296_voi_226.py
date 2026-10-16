from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent296VOI226(CatalogResponsibilityAgent):
    source_id = "VOI-226"
    source_name = "منسق الرد الصوتي"
    source_mission = "يحول إجابة LLM إلى مقاطع قصيرة قابلة للنطق"
    source_output = "speech_script"
    source_tools = "sentence splitter، SSML adapter"
    source_team = "specialist"

