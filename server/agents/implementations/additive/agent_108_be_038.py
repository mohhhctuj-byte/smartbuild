from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent108BE038(CatalogResponsibilityAgent):
    source_id = "BE-038"
    source_name = "وكيل المهام الخلفية"
    source_mission = "ينفذ jobs وإعادة المحاولة والـdead letter"
    source_output = "worker modules"
    source_tools = "Celery أو Arq، Redis"
    source_team = "backend"

