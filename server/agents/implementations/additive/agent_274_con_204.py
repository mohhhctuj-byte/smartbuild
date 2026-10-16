from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent274CON204(CatalogResponsibilityAgent):
    source_id = "CON-204"
    source_name = "مستخرج الكيانات"
    source_mission = "يستخرج أسماء الملفات والمكونات والصفحات والألوان والوظائف"
    source_output = "entities"
    source_tools = "JSON Schema، repo lookup"
    source_team = "specialist"

