from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent293VOI223(CatalogResponsibilityAgent):
    source_id = "VOI-223"
    source_name = "مصحح التفريغ"
    source_mission = "يصحح أسماء الملفات والمكتبات والكلمات التقنية من سياق المشروع"
    source_output = "corrected_transcript"
    source_tools = "glossary، fuzzy matching"
    source_team = "specialist"

