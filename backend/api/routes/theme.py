import json
import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException
from backend.config import settings

router = APIRouter()


@router.get("/theme/{theme_id}")
async def get_theme(theme_id: str):
    redis = aioredis.from_url(settings.redis_url)
    data = await redis.get(f"analysis:{theme_id}")
    await redis.close()
    if not data:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return json.loads(data)


@router.get("/theme/by-name/{name}")
async def get_theme_by_name(name: str, market: str = "A"):
    redis = aioredis.from_url(settings.redis_url)
    data = await redis.get(f"analysis:topic:{name}:{market}")
    await redis.close()
    if not data:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return json.loads(data)
