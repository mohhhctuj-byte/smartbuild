from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent280CON210(CatalogResponsibilityAgent):
    source_id = "CON-210"
    source_name = "مراجع فهم الكلام"
    source_mission = "يقارن intent والكيانات مع الطلب الأصلي ويمنع التنفيذ عند الثقة المنخفضة"
    source_output = "understanding_gate"
    source_tools = "evaluator، confidence rules"
    source_team = "specialist"

