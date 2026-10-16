from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent271CON201(CatalogResponsibilityAgent):
    source_id = "CON-201"
    source_name = "مستمع المستخدم"
    source_mission = "يستقبل النص أو تفريغ الصوت ويحدد اللغة واللهجة ونية الكلام"
    source_output = "utterance_record"
    source_tools = "Python، Pydantic، JSON Schema"
    source_team = "specialist"

