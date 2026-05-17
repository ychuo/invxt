import redis.asyncio as aioredis
from fastapi import APIRouter, Query
from backend.config import settings
from backend.services.trending_service import TrendingService

router = APIRouter()
_trending_service = TrendingService()


@router.get("/trending")
async def trending(market: str = Query("A")):
    cache_key = f"trending:topics:{market}"
    try:
        redis = aioredis.from_url(settings.redis_url)
        cached = await redis.get(cache_key)
        await redis.close()
        if cached:
            return {"topics": __import__("json").loads(cached)}
    except Exception:
        pass

    topics = await _trending_service.get_trending(market)

    # Only cache non-empty results to avoid poisoning cache with failures
    if topics:
        try:
            redis = aioredis.from_url(settings.redis_url)
            await redis.setex(cache_key, 21600, __import__("json").dumps(topics, ensure_ascii=False))
            await redis.close()
        except Exception:
            pass

    return {"topics": topics}
