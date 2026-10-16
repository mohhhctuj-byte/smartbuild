from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent247ORC177(CatalogResponsibilityAgent):
    source_id = "ORC-177"
    source_name = "وكيل الفروع والدمج"
    source_mission = "ينشئ worktree ويطبق patchات مرتبة"
    source_output = "merge plan"
    source_tools = "GitPython أو Git CLI adapter"
    source_team = "specialist"

