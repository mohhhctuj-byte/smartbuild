from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent171PERF101(CatalogResponsibilityAgent):
    source_id = "PERF-101"
    source_name = "أداء الواجهة"
    source_mission = "يقيس LCP/CLS/INP وحجم الحزمة"
    source_output = "frontend budget"
    source_tools = "Lighthouse، bundle analyzer"
    source_team = "specialist"

