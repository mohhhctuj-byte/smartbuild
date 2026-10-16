from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent238CODE168(CatalogResponsibilityAgent):
    source_id = "CODE-168"
    source_name = "مدير الاعتماديات"
    source_mission = "يضيف ويحدث dependency بأقل سطح خطر"
    source_output = "lockfile patch"
    source_tools = "uv/pip، pnpm، Renovate"
    source_team = "specialist"

