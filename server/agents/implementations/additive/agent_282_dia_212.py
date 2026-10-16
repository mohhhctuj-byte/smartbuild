from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent282DIA212(CatalogResponsibilityAgent):
    source_id = "DIA-212"
    source_name = "محلل رسالة الخطأ"
    source_mission = "يحول stack trace ورسالة البناء إلى سبب مفهوم"
    source_output = "error_explanation"
    source_tools = "Python، AST، log parser"
    source_team = "specialist"

