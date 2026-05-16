import asyncio
import json
import redis.asyncio as aioredis
from fastapi import APIRouter
from pydantic import BaseModel
from backend.config import settings
from backend.services.pipeline import AnalysisPipeline, StepStatus

router = APIRouter()


class AnalyzeRequest(BaseModel):
    topic: str
    market: str = "A"


async def _run_and_cache(topic: str, market: str, task_id: str):
    pipeline = AnalysisPipeline()
    redis = aioredis.from_url(settings.redis_url)

    async def on_step(state):
        await redis.setex(
            f"analysis:{task_id}",
            3600,
            json.dumps(state.to_dict(), ensure_ascii=False),
        )

    pipeline.on_step(on_step)
    state = await pipeline.run(topic, market)

    await redis.setex(
        f"analysis:{task_id}",
        3600,
        json.dumps(state.to_dict(), ensure_ascii=False),
    )
    await redis.setex(
        f"analysis:topic:{topic}:{market}",
        86400,
        json.dumps(state.to_dict(), ensure_ascii=False),
    )
    await redis.close()


@router.post("/analyze")
async def create_analysis(req: AnalyzeRequest):
    import uuid
    task_id = str(uuid.uuid4())

    # Write initial state so polling doesn't 404
    redis = aioredis.from_url(settings.redis_url)
    await redis.setex(
        f"analysis:{task_id}",
        3600,
        json.dumps({
            "task_id": task_id, "topic": req.topic, "market": req.market,
            "status": "running", "current_step": "starting",
            "theme": None, "chain": [], "companies": [], "scored": [], "error": None,
        }),
    )
    await redis.close()

    # Fire-and-forget background task
    asyncio.create_task(_run_and_cache(req.topic, req.market, task_id))

    return {"task_id": task_id, "topic": req.topic, "market": req.market}
