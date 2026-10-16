from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent094FE024(CatalogResponsibilityAgent):
    source_id = "FE-024"
    source_name = "وكيل الحالة"
    source_mission = "يختار server/client state ويمنع التضارب"
    source_output = "state modules"
    source_tools = "TanStack Query، Zustand أو Redux Toolkit"
    source_team = "frontend"

