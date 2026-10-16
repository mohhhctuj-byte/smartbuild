from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent242ORC172(CatalogResponsibilityAgent):
    source_id = "ORC-172"
    source_name = "مفكك المهام"
    source_mission = "يقسم المهمة إلى وحدات مستقلة قابلة للفحص"
    source_output = "subtasks"
    source_tools = "JSON Schema، dependency graph"
    source_team = "specialist"

