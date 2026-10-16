from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent298VOI228(CatalogResponsibilityAgent):
    source_id = "VOI-228"
    source_name = "وكيل جودة الصوت"
    source_mission = "يكتشف تقطع الصوت والضوضاء والتأخير"
    source_output = "voice_quality_report"
    source_tools = "audio metrics، telemetry"
    source_team = "specialist"

