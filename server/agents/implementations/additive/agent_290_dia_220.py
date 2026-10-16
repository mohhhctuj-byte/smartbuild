from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent290DIA220(CatalogResponsibilityAgent):
    source_id = "DIA-220"
    source_name = "مراجع التشخيص"
    source_mission = "يمنع التفسير الواثق إذا كانت الأدلة غير كافية ويطلب logs أو reproduction"
    source_output = "diagnosis_gate"
    source_tools = "evidence scoring، policy engine"
    source_team = "specialist"

