from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent256GOV186(CatalogResponsibilityAgent):
    source_id = "GOV-186"
    source_name = "كاشف prompt injection"
    source_mission = "يفصل تعليمات البيانات عن تعليمات النظام"
    source_output = "injection findings"
    source_tools = "content classifier، allowlist"
    source_team = "specialist"

