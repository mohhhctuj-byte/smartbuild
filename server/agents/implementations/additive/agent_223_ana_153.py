from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent223ANA153(CatalogResponsibilityAgent):
    source_id = "ANA-153"
    source_name = "وكيل warehouse"
    source_mission = "يحدد raw/staging/mart layers"
    source_output = "warehouse model"
    source_tools = "SQL، dbt عند الحاجة"
    source_team = "specialist"

