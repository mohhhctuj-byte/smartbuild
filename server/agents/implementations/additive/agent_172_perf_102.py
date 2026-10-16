from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent172PERF102(CatalogResponsibilityAgent):
    source_id = "PERF-102"
    source_name = "أداء الخادم"
    source_mission = "يقيس latency وthroughput وtimeouts"
    source_output = "backend budget"
    source_tools = "Locust، k6، OpenTelemetry"
    source_team = "specialist"

