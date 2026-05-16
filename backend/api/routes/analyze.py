import json
import redis.asyncio as aioredis
from fastapi import APIRouter
from pydantic import BaseModel
from backend.config import settings
from backend.services.pipeline import AnalysisPipeline

router = APIRouter()


class AnalyzeRequest(BaseModel):
    topic: str
    market: str = "A"


@router.post("/analyze")
async def create_analysis(req: AnalyzeRequest):
    pipeline = AnalysisPipeline()
    state = await pipeline.run(req.topic, req.market)

    redis = aioredis.from_url(settings.redis_url)
    await redis.setex(
        f"analysis:{state.task_id}",
        3600,
        json.dumps(state.to_dict(), ensure_ascii=False),
    )
    await redis.setex(
        f"analysis:topic:{req.topic}:{req.market}",
        86400,
        json.dumps(state.to_dict(), ensure_ascii=False),
    )
    await redis.close()

    return {"task_id": state.task_id, "topic": req.topic, "market": req.market}
