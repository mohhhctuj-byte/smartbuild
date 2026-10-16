from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent272CON202(CatalogResponsibilityAgent):
    source_id = "CON-202"
    source_name = "محلل المصري"
    source_mission = "يفسر العامية والاختصارات مثل «اعملّي» و«البايظ» دون تغيير المعنى"
    source_output = "normalized_intent"
    source_tools = "Python، dialect rules، structured output"
    source_team = "specialist"

