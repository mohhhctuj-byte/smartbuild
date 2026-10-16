from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent205COM135(CatalogResponsibilityAgent):
    source_id = "COM-135"
    source_name = "وكيل الضرائب والشحن"
    source_mission = "يفصل قواعد المنطقة عن الكود"
    source_output = "tax/shipping adapter"
    source_tools = "provider API، decimal arithmetic"
    source_team = "specialist"

