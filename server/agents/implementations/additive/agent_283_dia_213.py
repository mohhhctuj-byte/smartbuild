from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent283DIA213(CatalogResponsibilityAgent):
    source_id = "DIA-213"
    source_name = "متتبع السبب"
    source_mission = "يربط الخطأ بالملف والسطر والتغيير الذي سببه"
    source_output = "root_cause_graph"
    source_tools = "Git diff، tree-sitter"
    source_team = "specialist"

