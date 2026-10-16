from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent253GOV183(CatalogResponsibilityAgent):
    source_id = "GOV-183"
    source_name = "مدقق التراخيص"
    source_mission = "يطابق الاعتماديات مع سياسة الترخيص"
    source_output = "license report"
    source_tools = "SPDX، package metadata"
    source_team = "specialist"

