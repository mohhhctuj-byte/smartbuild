from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent168QA098(CatalogResponsibilityAgent):
    source_id = "QA-098"
    source_name = "وكيل اختبار الوصولية"
    source_mission = "يشغل قواعد a11y في الصفحات"
    source_output = "accessibility findings"
    source_tools = "axe-core، Playwright"
    source_team = "quality"

