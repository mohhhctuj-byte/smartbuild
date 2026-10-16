from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent255GOV185(CatalogResponsibilityAgent):
    source_id = "GOV-185"
    source_name = "وكيل sandbox"
    source_mission = "يحدد filesystem/network/process permissions"
    source_output = "execution profile"
    source_tools = "Docker، seccomp policy عند توفرها"
    source_team = "specialist"

