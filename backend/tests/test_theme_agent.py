import os
import pytest
from backend.services.llm_client import LLMClient
from backend.services.theme_agent import ThemeAgent


@pytest.mark.asyncio
async def test_theme_analysis():
    if not os.environ.get("LLM_API_KEY"):
        pytest.skip("LLM_API_KEY not set")
    llm = LLMClient()
    agent = ThemeAgent(llm)
    result = await agent.analyze("HBM")

    assert "theme_name" in result
    assert "category" in result
    assert "directions" in result
    assert len(result["directions"]) >= 3

    positions = [d["position"] for d in result["directions"]]
    assert any(p in ["上游", "中游", "下游"] for p in positions)
