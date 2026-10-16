from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent231CODE161(CatalogResponsibilityAgent):
    source_id = "CODE-161"
    source_name = "مستكشف المستودع"
    source_mission = "يبني خريطة الملفات والعلاقات"
    source_output = "repo map"
    source_tools = "tree-sitter، ripgrep"
    source_team = "specialist"

