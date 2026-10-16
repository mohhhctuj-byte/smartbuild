from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent252GOV182(CatalogResponsibilityAgent):
    source_id = "GOV-182"
    source_name = "كاشف البيانات الشخصية"
    source_mission = "يحدد PII في النصوص والملفات والسجلات"
    source_output = "PII findings"
    source_tools = "Presidio أو regex + validator"
    source_team = "specialist"

