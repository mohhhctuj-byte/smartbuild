from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent275CON205(CatalogResponsibilityAgent):
    source_id = "CON-205"
    source_name = "مدير سياق الحوار"
    source_mission = "يربط آخر كلام بالمشروع والرسائل السابقة دون إرسال تاريخ كامل"
    source_output = "context_pack"
    source_tools = "Redis، PostgreSQL، token counter"
    source_team = "specialist"

