"""
Threat Indicators — persistent store for known phishing domains/IPs/emails.
Checked BEFORE ML models to catch known threats instantly (~5ms vs ~200ms).
Redis cache layer prevents repeated DB hits for the same indicators.
"""
import logging
from typing import Optional, List
from datetime import datetime, timedelta

from app.db.supabase_client import get_supabase_admin
from app.cache.redis_client import cache_get, cache_set
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

INDICATOR_CACHE_TTL = 300   # 5 minutes — indicators don't change that often


async def check_indicator(indicator_type: str, value: str) -> Optional[dict]:
    """
    Check if a value is in the threat_indicators table.
    Returns indicator dict if found, None if clean.
    Cache-first: Redis → Supabase.
    """
    cache_key = f"indicator:{indicator_type}:{value.lower()}"

    # Try cache first
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached if cached.get("found") else None

    # Hit DB
    supabase = get_supabase_admin()
    try:
        resp = (
            supabase.table("threat_indicators")
            .select("*")
            .eq("indicator_type", indicator_type)
            .eq("value", value.lower())
            .single()
            .execute()
        )
        result = resp.data
        await cache_set(cache_key, {"found": True, **result}, ttl=INDICATOR_CACHE_TTL)
        return result
    except Exception:
        # .single() raises if no rows — means clean
        await cache_set(cache_key, {"found": False}, ttl=INDICATOR_CACHE_TTL)
        return None


async def upsert_indicator(
    indicator_type: str,
    value: str,
    threat_score: float,
    source: str = "ml_model",
) -> dict:
    """
    Insert or update a threat indicator.
    Increments report_count on conflict.
    Called by ML engines when they detect phishing.
    """
    supabase = get_supabase_admin()
    value = value.lower().strip()

    existing = await check_indicator(indicator_type, value)
    if existing:
        resp = (
            supabase.table("threat_indicators")
            .update({
                "threat_score": max(existing["threat_score"], threat_score),
                "last_seen": datetime.utcnow().isoformat(),
                "report_count": existing["report_count"] + 1,
            })
            .eq("id", existing["id"])
            .execute()
        )
        # Invalidate cache
        await cache_set(f"indicator:{indicator_type}:{value}", {"found": False}, ttl=1)
        return resp.data[0]
    else:
        resp = (
            supabase.table("threat_indicators")
            .insert({
                "indicator_type": indicator_type,
                "value": value,
                "threat_score": threat_score,
                "source": source,
                "verified": False,
            })
            .execute()
        )
        return resp.data[0]


async def get_campaign_domains(domain: str) -> int:
    """
    Count how many DIFFERENT users have reported the same domain
    within the campaign window. Used for cross-user correlation (Level 3).
    """
    supabase = get_supabase_admin()
    window_start = (
        datetime.utcnow() - timedelta(days=settings.campaign_window_days)
    ).isoformat()

    resp = (
        supabase.table("analyses")
        .select("user_id", count="exact")
        .ilike("raw_input", f"%{domain}%")
        .eq("final_verdict", "phishing")
        .gte("created_at", window_start)
        .execute()
    )
    # Count distinct user_ids
    user_ids = {row["user_id"] for row in (resp.data or [])}
    return len(user_ids)
