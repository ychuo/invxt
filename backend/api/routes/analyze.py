import asyncio
import json
import redis.asyncio as aioredis
from fastapi import APIRouter
from pydantic import BaseModel
from backend.config import settings
from backend.services.pipeline import AnalysisPipeline, StepStatus

router = APIRouter()

# Per-topic lock to deduplicate concurrent analysis requests
_topic_locks: dict[str, asyncio.Lock] = {}
_topic_tasks: dict[str, str] = {}  # topic:market -> task_id
_global_sem = asyncio.Semaphore(1)  # only one LLM call at a time


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

    async with _global_sem:
        state = await pipeline.run(topic, market)

    await redis.setex(
        f"analysis:{task_id}",
        3600,
        json.dumps(state.to_dict(), ensure_ascii=False),
    )
    if state.status == StepStatus.COMPLETED:
        await redis.setex(
            f"analysis:topic:{topic}:{market}",
            86400,
            json.dumps(state.to_dict(), ensure_ascii=False),
        )
    await redis.close()


@router.post("/analyze")
async def create_analysis(req: AnalyzeRequest):
    cache_key = f"{req.topic}:{req.market}"

    # Per-topic lock to prevent concurrent duplicate requests
    if cache_key not in _topic_locks:
        _topic_locks[cache_key] = asyncio.Lock()

    async with _topic_locks[cache_key]:
        # Check again under lock — another request may have finished
        if cache_key in _topic_tasks:
            return {"task_id": _topic_tasks[cache_key], "topic": req.topic, "market": req.market, "cached": True}

        # Check Redis for a completed cached result
        redis = aioredis.from_url(settings.redis_url)
        cached = await redis.get(f"analysis:topic:{req.topic}:{req.market}")
        await redis.close()
        if cached:
            data = json.loads(cached)
            if data.get("status") == "completed":
                return {"task_id": data["task_id"], "topic": req.topic, "market": req.market, "cached": True}

        task_id = str(__import__("uuid").uuid4())
        _topic_tasks[cache_key] = task_id

    # Write initial state
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

    async def _cleanup():
        try:
            await _run_and_cache(req.topic, req.market, task_id)
        finally:
            _topic_tasks.pop(cache_key, None)

    asyncio.create_task(_cleanup())

    return {"task_id": task_id, "topic": req.topic, "market": req.market}
