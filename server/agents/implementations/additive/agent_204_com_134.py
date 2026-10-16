from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent204COM134(CatalogResponsibilityAgent):
    source_id = "COM-134"
    source_name = "وكيل الاشتراكات"
    source_mission = "يحدد plans/trials/renewal/cancel"
    source_output = "subscription state machine"
    source_tools = "provider webhooks، SQLAlchemy"
    source_team = "specialist"

