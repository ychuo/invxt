import asyncio
import json
import redis.asyncio as aioredis
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from backend.config import settings
from backend.services.pipeline import AnalysisPipeline, StepStatus
from backend.services.agentic_analyzer import AgenticAnalyzer

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


@router.post("/analyze/stream")
async def analyze_stream(req: AnalyzeRequest):
    task_id = str(__import__("uuid").uuid4())
    analyzer = AgenticAnalyzer()

    # Accumulate blocks and thinking for Redis persistence
    blocks: dict[str, object] = {}
    thinking_entries: list[dict] = []
    status = "running"

    async def event_stream():
        nonlocal status

        # Write initial state
        redis = aioredis.from_url(settings.redis_url)
        await redis.setex(
            f"analysis:{task_id}",
            3600,
            json.dumps({
                "task_id": task_id, "topic": req.topic, "market": req.market,
                "status": "running", "current_step": "starting",
                "theme": None, "chain": [], "companies": [], "scored": [], "error": None,
            }, ensure_ascii=False),
        )
        await redis.close()

        # First event carries the task_id
        yield f"data: {json.dumps({'type': 'meta', 'task_id': task_id}, ensure_ascii=False)}\n\n"

        q: asyncio.Queue = asyncio.Queue()

        async def _run():
            nonlocal status, blocks, thinking_entries
            try:
                async for event in analyzer.analyze(req.topic, req.market):
                    await q.put(event)
                    # Accumulate thinking entries (exclude raw thinking token chunks, they'd be too many)
                    if event.get("type") in ("tool_call", "tool_result", "conclusion", "correction", "error"):
                        thinking_entries.append(event)
                    # Persist block updates on conclusion
                    if event.get("type") == "conclusion":
                        block = event.get("block", "")
                        try:
                            content = json.loads(event.get("content", "")) if isinstance(event.get("content"), str) else event.get("content")
                        except (json.JSONDecodeError, TypeError):
                            content = event.get("content")
                        blocks[block] = content
                        await _save_state(task_id, req.topic, req.market, blocks, thinking_entries, "running")
                    elif event.get("type") == "correction":
                        thinking_entries.append(event)
                        await _save_state(task_id, req.topic, req.market, blocks, thinking_entries, "running")
            except Exception as e:
                import sys, traceback
                print(f"[SSE] analyzer error: {type(e).__name__}: {e}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                await q.put({"type": "error", "message": f"{type(e).__name__}: {e}"})
            finally:
                await q.put(None)

        asyncio.create_task(_run())

        while True:
            try:
                item = await asyncio.wait_for(q.get(), timeout=15.0)
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
                continue

            if item is None:
                break
            yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"

        # Done — persist final state
        status = "completed"
        await _save_state(task_id, req.topic, req.market, blocks, thinking_entries, status)
        # Topic-level cache for 24h
        redis = aioredis.from_url(settings.redis_url)
        await redis.setex(
            f"analysis:topic:{req.topic}:{req.market}",
            86400,
            json.dumps(_build_state(task_id, req.topic, req.market, blocks, thinking_entries, status), ensure_ascii=False),
        )
        await redis.close()
        yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _save_state(task_id: str, topic: str, market: str, blocks: dict, thinking: list, status: str):
    redis = aioredis.from_url(settings.redis_url)
    state = _build_state(task_id, topic, market, blocks, thinking, status)
    await redis.setex(f"analysis:{task_id}", 3600, json.dumps(state, ensure_ascii=False))
    await redis.close()


def _build_state(task_id: str, topic: str, market: str, blocks: dict, thinking: list, status: str) -> dict:
    return {
        "task_id": task_id,
        "topic": topic,
        "market": market,
        "status": status,
        "current_step": "done",
        "theme": blocks.get("theme"),
        "chain": blocks.get("chain") or [],
        "companies": blocks.get("companies") or [],
        "scored": blocks.get("logic") or [],
        "search": [],
        "thinking": thinking,
        "error": None,
    }
