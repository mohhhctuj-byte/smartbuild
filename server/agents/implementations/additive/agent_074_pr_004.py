from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent074PR004(CatalogResponsibilityAgent):
    source_id = "PR-004"
    source_name = "كاتب قصص المستخدم"
    source_mission = "يحول الميزات إلى user stories"
    source_output = "قصص بصيغة قابلة للتنفيذ"
    source_tools = "Pydantic، Markdown"
    source_team = "product"

