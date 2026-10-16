from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent299VOI229(CatalogResponsibilityAgent):
    source_id = "VOI-229"
    source_name = "مدير الخصوصية الصوتية"
    source_mission = "يحدد مدة الاحتفاظ بالتسجيل ويمنع تخزينه دون موافقة"
    source_output = "audio_retention_policy"
    source_tools = "consent service، object storage"
    source_team = "specialist"

