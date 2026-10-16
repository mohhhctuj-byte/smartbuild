from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent254GOV184(CatalogResponsibilityAgent):
    source_id = "GOV-184"
    source_name = "وكيل الموافقة"
    source_mission = "يحدد consent وpurpose وwithdrawal"
    source_output = "consent contract"
    source_tools = "DB schema، audit events"
    source_team = "specialist"

