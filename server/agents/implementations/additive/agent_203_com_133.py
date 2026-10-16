from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent203COM133(CatalogResponsibilityAgent):
    source_id = "COM-133"
    source_name = "وكيل الدفع"
    source_mission = "يربط مزود الدفع خلف adapter"
    source_output = "payment module"
    source_tools = "Stripe/مزود يختاره المستخدم"
    source_team = "specialist"

