"""Research and design canonical agent category."""
from ..registry import get_agent

GoogleDesignTrendsSearcher = type(get_agent("agent_010"))
AssetIconFinder = type(get_agent("agent_011"))
CompetitorUiScraper = type(get_agent("agent_012"))
ColorPaletteScout = type(get_agent("agent_013"))
