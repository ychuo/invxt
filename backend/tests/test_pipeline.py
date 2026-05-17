import os
import pytest
from backend.services.pipeline import AnalysisPipeline, StepStatus


@pytest.mark.asyncio
async def test_pipeline_integration():
    if not os.environ.get("LLM_API_KEY"):
        pytest.skip("LLM_API_KEY not set")
    pipeline = AnalysisPipeline()
    state = await pipeline.run("HBM", market="A")

    assert state.status == StepStatus.COMPLETED
    assert state.theme_result is not None
    assert len(state.chain_results) >= 1
    assert len(state.scored_results) >= 1

    scores = [c["exposure_score"] for c in state.scored_results]
    assert scores == sorted(scores, reverse=True)
