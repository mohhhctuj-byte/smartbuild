from __future__ import annotations

from ..catalog_agent import CatalogResponsibilityAgent


class Agent134AI064(CatalogResponsibilityAgent):
    source_id = "AI-064"
    source_name = "مهندس RAG"
    source_mission = "يحدد ingest/retrieve/rerank/cite"
    source_output = "RAG pipeline"
    source_tools = "pgvector، chunking، reranker"
    source_team = "ai"

