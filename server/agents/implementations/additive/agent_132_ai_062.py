from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent132AI062(CatalogResponsibilityAgent):
    source_id = "AI-062"
    source_name = "موجه النماذج"
    source_mission = "يختار النموذج حسب صعوبة المهمة والخصوصية"
    source_output = "routing decision"
    source_tools = "OpenAI-compatible SDK، policy rules"
    source_team = "ai"

