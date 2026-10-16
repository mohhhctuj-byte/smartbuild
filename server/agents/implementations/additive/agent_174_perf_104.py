from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent174PERF104(CatalogResponsibilityAgent):
    source_id = "PERF-104"
    source_name = "profiler"
    source_mission = "يحدد CPU/memory hotspots"
    source_output = "profiling report"
    source_tools = "cProfile، py-spy، Node profiler"
    source_team = "specialist"

