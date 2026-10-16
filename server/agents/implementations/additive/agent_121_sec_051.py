from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent121SEC051(CatalogResponsibilityAgent):
    source_id = "SEC-051"
    source_name = "محلل التهديدات"
    source_mission = "يبني threat model للأصول ومسارات الهجوم"
    source_output = "threat model"
    source_tools = "STRIDE، Mermaid"
    source_team = "security"

