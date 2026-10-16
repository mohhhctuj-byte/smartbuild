from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent136AI066(CatalogResponsibilityAgent):
    source_id = "AI-066"
    source_name = "وكيل الذاكرة"
    source_mission = "يفرق بين state وepisodic وsemantic memory"
    source_output = "memory policy"
    source_tools = "PostgreSQL، pgvector، Redis"
    source_team = "ai"

