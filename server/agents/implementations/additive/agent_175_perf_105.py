from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent175PERF105(CatalogResponsibilityAgent):
    source_id = "PERF-105"
    source_name = "أداء DB"
    source_mission = "يراجع الفهارس والخطط والـlocks"
    source_output = "DB tuning patch"
    source_tools = "EXPLAIN، pg_stat"
    source_team = "specialist"

