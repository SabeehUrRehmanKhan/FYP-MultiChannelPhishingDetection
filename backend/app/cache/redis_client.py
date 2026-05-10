import redis.asyncio as aioredis
import json
import logging
from typing import Optional, Any
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_redis: Optional[aioredis.Redis] = None


async def init_redis():
    global _redis
    _redis = await aioredis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
        ssl_cert_reqs="none" if settings.redis_url.startswith("rediss://") else None
    )


async def close_redis():
    global _redis
    if _redis:
        await _redis.close()


def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis not initialized. Call init_redis() on startup.")
    return _redis


# ─────────────────────────────────────────────
# Session Cache
# ─────────────────────────────────────────────

async def cache_set(key: str, value: Any, ttl: int = None) -> None:
    r = get_redis()
    ttl = ttl or settings.redis_ttl_seconds
    await r.setex(key, ttl, json.dumps(value))


async def cache_get(key: str) -> Optional[Any]:
    r = get_redis()
    raw = await r.get(key)
    return json.loads(raw) if raw else None


async def cache_delete(key: str) -> None:
    r = get_redis()
    await r.delete(key)


# ─────────────────────────────────────────────
# Rate Limiting (sliding window)
# ─────────────────────────────────────────────

async def check_rate_limit(user_id: str, action: str, limit: int, window_seconds: int) -> bool:
    """
    Returns True if request is allowed, False if rate limit exceeded.
    Uses Redis sorted set as sliding window counter.
    """
    import time
    r = get_redis()
    now = time.time()
    key = f"ratelimit:{action}:{user_id}"
    window_start = now - window_seconds

    pipe = r.pipeline()
    pipe.zremrangebyscore(key, 0, window_start)        # Remove old entries
    pipe.zadd(key, {str(now): now})                    # Add current request
    pipe.zcard(key)                                    # Count in window
    pipe.expire(key, window_seconds)
    results = await pipe.execute()

    count = results[2]
    if count > limit:
        logger.warning(f"Rate limit exceeded: {user_id} on {action} ({count}/{limit})")
        return False
    return True


# ─────────────────────────────────────────────
# Analysis State (during streaming)
# ─────────────────────────────────────────────

async def store_analysis_state(analysis_id: str, state: dict) -> None:
    """Temporarily store streaming analysis state while SSE is active."""
    await cache_set(f"analysis_state:{analysis_id}", state, ttl=300)


async def get_analysis_state(analysis_id: str) -> Optional[dict]:
    return await cache_get(f"analysis_state:{analysis_id}")
