from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent261REL191(CatalogResponsibilityAgent):
    source_id = "REL-191"
    source_name = "كاتب changelog"
    source_mission = "يستخرج التغييرات من commits وPRs"
    source_output = "changelog"
    source_tools = "Git، Keep a Changelog"
    source_team = "specialist"

