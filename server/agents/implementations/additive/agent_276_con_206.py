from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent276CON206(CatalogResponsibilityAgent):
    source_id = "CON-206"
    source_name = "وكيل الأسئلة الذكية"
    source_mission = "يسأل سؤالًا واحدًا أو اثنين فقط عند وجود غموض مؤثر"
    source_output = "clarifying_question"
    source_tools = "policy rules، conversation state"
    source_team = "specialist"

