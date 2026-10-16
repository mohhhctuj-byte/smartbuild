from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent075PR005(CatalogResponsibilityAgent):
    source_id = "PR-005"
    source_name = "كاتب معايير القبول"
    source_mission = "يكتب Given/When/Then لكل قصة"
    source_output = "acceptance tests"
    source_tools = "Python، Gherkin parser"
    source_team = "product"

