import os
import pytest
from backend.services.llm_client import LLMClient
from backend.services.mapping_agent import MappingAgent
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.vector_store import VectorStore


@pytest.mark.asyncio
async def test_company_mapping():
    if not os.environ.get("DEEPSEEK_API_KEY"):
        pytest.skip("DEEPSEEK_API_KEY not set")
    llm = LLMClient()
    neo4j = Neo4jClient()
    vector = VectorStore()
    agent = MappingAgent(llm, neo4j, vector)

    chain_node = {
        "direction": "先进封装",
        "upstream": ["封装基板", "环氧塑封料"],
        "downstream": ["AI GPU", "HBM"],
    }
    results = await agent.map_companies(chain_node)

    assert isinstance(results, list)
    assert len(results) >= 2
    for r in results:
        assert "company_name" in r
        assert "reasoning" in r
        assert "market" in r

    neo4j.close()
    vector.close()
