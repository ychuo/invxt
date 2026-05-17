import os
import pytest
from backend.services.llm_client import LLMClient
from backend.services.chain_agent import ChainAgent
from backend.kg.neo4j_client import Neo4jClient
from backend.kg.vector_store import VectorStore


@pytest.mark.asyncio
async def test_chain_reasoning():
    if not os.environ.get("LLM_API_KEY"):
        pytest.skip("LLM_API_KEY not set")
    llm = LLMClient()
    neo4j = Neo4jClient()
    vector = VectorStore()
    agent = ChainAgent(llm, neo4j, vector)

    direction = {"name": "TSV技术", "position": "中游", "description": "硅通孔技术，HBM核心工艺"}
    result = await agent.analyze_direction(direction)

    assert "direction" in result
    assert "upstream" in result
    assert "downstream" in result
    assert len(result.get("key_materials", [])) >= 1

    neo4j.close()
    vector.close()
