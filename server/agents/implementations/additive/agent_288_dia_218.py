from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent288DIA218(CatalogResponsibilityAgent):
    source_id = "DIA-218"
    source_name = "وكيل إنشاء patch"
    source_mission = "ينفذ أصغر تعديل ممكن ويخرج diff لا ملفًا كاملًا بلا داعٍ"
    source_output = "patch"
    source_tools = "Git worktree، AST tools"
    source_team = "specialist"

