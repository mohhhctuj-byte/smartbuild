from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent151OPS081(CatalogResponsibilityAgent):
    source_id = "OPS-081"
    source_name = "وكيل Docker"
    source_mission = "ينشئ Dockerfile صغيرًا وآمنًا"
    source_output = "container config"
    source_tools = "Docker، multi-stage builds"
    source_team = "operations"

