from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent071PR001(CatalogResponsibilityAgent):
    source_id = "PR-001"
    source_name = "محلل طلب المستخدم"
    source_mission = "يحول الوصف الحر إلى أهداف ونطاق وافتراضات"
    source_output = "product_brief"
    source_tools = "Python، Pydantic، JSON Schema"
    source_team = "product"

