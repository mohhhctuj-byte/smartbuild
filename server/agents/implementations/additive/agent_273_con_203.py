from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent273CON203(CatalogResponsibilityAgent):
    source_id = "CON-203"
    source_name = "كاشف النية"
    source_mission = "يفرق بين إنشاء، تعديل، سؤال، شرح خطأ، تراجع، تشغيل، ونشر"
    source_output = "intent"
    source_tools = "classifier، Pydantic"
    source_team = "specialist"

