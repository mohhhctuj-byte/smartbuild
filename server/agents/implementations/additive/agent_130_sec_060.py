from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent130SEC060(CatalogResponsibilityAgent):
    source_id = "SEC-060"
    source_name = "مراجع الأمن"
    source_mission = "يعيد تشغيل الفحوص ويصنف الخطورة"
    source_output = "security gate"
    source_tools = "Semgrep، ZAP في بيئة اختبار"
    source_team = "security"

