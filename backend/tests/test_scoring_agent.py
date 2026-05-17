import os
import pytest
from backend.services.llm_client import LLMClient
from backend.services.scoring_agent import ScoringAgent
from backend.kg.neo4j_client import Neo4jClient


@pytest.mark.asyncio
async def test_scoring():
    if not os.environ.get("LLM_API_KEY"):
        pytest.skip("LLM_API_KEY not set")
    llm = LLMClient()
    neo4j = Neo4jClient()
    agent = ScoringAgent(llm, neo4j)

    companies = [
        {
            "company_name": "长电科技", "ticker": "600584.SH", "market": "A",
            "reasoning": "国内先进封装龙头，布局2.5D/3D封装",
        },
        {
            "company_name": "通富微电", "ticker": "002156.SZ", "market": "A",
            "reasoning": "AMD封测合作伙伴",
        },
    ]
    results = await agent.score("HBM", companies)

    assert len(results) >= 2
    assert results[0]["exposure_score"] >= results[1]["exposure_score"]
    for r in results:
        assert "exposure_score" in r
        assert "investment_logic" in r
        assert "dimensions" in r

    neo4j.close()
