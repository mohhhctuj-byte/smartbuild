from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent278CON208(CatalogResponsibilityAgent):
    source_id = "CON-208"
    source_name = "وكيل التأكيد"
    source_mission = "يعيد صياغة الطلب قبل التغيير الخطير"
    source_output = "confirmation_request"
    source_tools = "JSON Schema، approval policy"
    source_team = "specialist"

