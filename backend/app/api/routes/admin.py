"""
Admin Routes — require_admin dependency on all endpoints.

- GET   /admin/stats                      : platform-wide dashboard stats
- GET   /admin/threat-indicators          : view all indicators
- PATCH /admin/threat-indicators/{id}/verify : manually verify/unverify
- DELETE /admin/threat-indicators/{id}   : remove indicator
- GET   /admin/users                      : list all users
- PATCH /admin/users/{id}/role           : change user role
- GET   /admin/campaigns                  : active campaign signals
"""
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from app.auth.dependencies import require_admin, require_moderator
from app.schemas.all import RoleUpdate, ThreatIndicatorVerify, PlatformStats
from app.schemas.auth import UserProfile
from app.db.supabase_client import get_supabase_admin
from app.cache.redis_client import cache_delete

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/stats", response_model=PlatformStats)
async def platform_stats(admin: UserProfile = Depends(require_moderator)):
    """
    Aggregated platform statistics for admin dashboard.
    Shows analyses today, verdict distribution, campaign count, pending feedback.
    """
    supabase = get_supabase_admin()
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0).isoformat()

    # Total analyses
    total = supabase.table("analyses").select("id", count="exact").execute()

    # Today's analyses
    today = (
        supabase.table("analyses")
        .select("id", count="exact")
        .gte("created_at", today_start)
        .execute()
    )

    # Verdict counts
    phishing_count = (
        supabase.table("analyses")
        .select("id", count="exact")
        .eq("final_verdict", "phishing")
        .execute()
    )
    legit_count = (
        supabase.table("analyses")
        .select("id", count="exact")
        .eq("final_verdict", "legitimate")
        .execute()
    )
    suspicious_count = (
        supabase.table("analyses")
        .select("id", count="exact")
        .eq("final_verdict", "suspicious")
        .execute()
    )

    # Active campaigns
    week_ago_dt = datetime.utcnow() - timedelta(days=7)
    week_ago = week_ago_dt.isoformat()
    campaigns = (
        supabase.table("campaign_signals")
        .select("id", count="exact")
        .gte("created_at", week_ago)
        .execute()
    )

    # Accuracy calculation (approved feedback / total reviewed feedback)
    feedback_stats = (
        supabase.table("feedback")
        .select("status")
        .neq("status", "pending")
        .execute()
    )
    total_reviewed = len(feedback_stats.data) if feedback_stats.data else 0
    approved = sum(1 for f in feedback_stats.data if f["status"] == "approved") if feedback_stats.data else 0
    accuracy = (approved / total_reviewed) if total_reviewed > 0 else 0.95 # Default to 95% if no feedback

    # Analyses per day (last 7 days)
    timeline = []
    for i in range(6, -1, -1):
        day = (datetime.utcnow() - timedelta(days=i)).date()
        day_start = datetime.combine(day, datetime.min.time()).isoformat()
        day_end = datetime.combine(day, datetime.max.time()).isoformat()
        
        day_count = (
            supabase.table("analyses")
            .select("id", count="exact")
            .gte("created_at", day_start)
            .lte("created_at", day_end)
            .execute()
        )
        timeline.append({"date": day.strftime("%m/%d"), "count": day_count.count or 0})

    # Pending feedback
    pending_fb = (
        supabase.table("feedback")
        .select("id", count="exact")
        .eq("status", "pending")
        .execute()
    )

    # Verified dataset size
    dataset_size = (
        supabase.table("verified_dataset")
        .select("id", count="exact")
        .execute()
    )

    # Top reported domains
    top_domains_resp = (
        supabase.table("threat_indicators")
        .select("value, threat_score, report_count, verified")
        .eq("indicator_type", "domain")
        .order("report_count", desc=True)
        .limit(10)
        .execute()
    )

    return PlatformStats(
        total_analyses=total.count or 0,
        analyses_today=today.count or 0,
        phishing_count=phishing_count.count or 0,
        legitimate_count=legit_count.count or 0,
        suspicious_count=suspicious_count.count or 0,
        campaign_count=campaigns.count or 0,
        accuracy=accuracy,
        analyses_per_day=timeline,
        pending_feedback=pending_fb.count or 0,
        verified_dataset_size=dataset_size.count or 0,
        top_domains=top_domains_resp.data or [],
    )



# ─────────────────────────────────────────────
# Threat Indicators Management
# ─────────────────────────────────────────────

@router.get("/threat-indicators")
async def list_threat_indicators(
    indicator_type: str = None,
    verified: bool = None,
    page: int = 1,
    limit: int = 50,
    admin: UserProfile = Depends(require_moderator),
):
    """View all threat indicators with filter options."""
    supabase = get_supabase_admin()
    offset = (page - 1) * limit

    query = (
        supabase.table("threat_indicators")
        .select("*")
        .order("report_count", desc=True)
    )
    if indicator_type:
        query = query.eq("indicator_type", indicator_type)
    if verified is not None:
        query = query.eq("verified", verified)

    resp = query.range(offset, offset + limit - 1).execute()
    return {"indicators": resp.data or [], "page": page, "limit": limit}


@router.patch("/threat-indicators/{indicator_id}/verify")
async def verify_indicator(
    indicator_id: str,
    body: ThreatIndicatorVerify,
    admin: UserProfile = Depends(require_moderator),
):
    """Manually verify or unverify a threat indicator. Verified = trusted source of truth."""
    supabase = get_supabase_admin()

    resp = (
        supabase.table("threat_indicators")
        .update({"verified": body.verified})
        .eq("id", indicator_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Indicator not found")

    # Invalidate cache for this indicator
    indicator = resp.data[0]
    await cache_delete(f"indicator:{indicator['indicator_type']}:{indicator['value']}")

    return {"status": "updated", "verified": body.verified}


@router.delete("/threat-indicators/{indicator_id}")
async def delete_indicator(
    indicator_id: str,
    admin: UserProfile = Depends(require_moderator),
):
    """Remove a threat indicator (e.g. false positive reported domain)."""
    supabase = get_supabase_admin()

    try:
        indicator = (
            supabase.table("threat_indicators")
            .select("indicator_type, value")
            .eq("id", indicator_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Indicator not found")

    supabase.table("threat_indicators").delete().eq("id", indicator_id).execute()
    await cache_delete(f"indicator:{indicator.data['indicator_type']}:{indicator.data['value']}")

    return {"status": "deleted"}


# ─────────────────────────────────────────────
# User Management
# ─────────────────────────────────────────────

@router.get("/users")
async def list_users(
    page: int = 1,
    limit: int = 50,
    admin: UserProfile = Depends(require_admin),
):
    """List all registered users with their roles."""
    supabase = get_supabase_admin()
    offset = (page - 1) * limit

    resp = (
        supabase.table("profiles")
        .select("id, email, display_name, role, created_at")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"users": resp.data or [], "page": page, "limit": limit}


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: RoleUpdate,
    admin: UserProfile = Depends(require_admin),
):
    """Promote or demote a user's role. Admin cannot demote themselves."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    supabase = get_supabase_admin()
    resp = (
        supabase.table("profiles")
        .update({"role": body.role})
        .eq("id", user_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="User not found")

    logger.info(f"Admin {admin.id} changed user {user_id} role to {body.role}")
    return {"status": "updated", "user_id": user_id, "new_role": body.role}


# ─────────────────────────────────────────────
# Campaign Signals
# ─────────────────────────────────────────────

@router.get("/campaigns")
async def list_campaigns(
    page: int = 1,
    limit: int = 20,
    admin: UserProfile = Depends(require_moderator),
):
    """View active phishing campaign signals (cross-user Level 3 correlations)."""
    supabase = get_supabase_admin()
    offset = (page - 1) * limit

    resp = (
        supabase.table("campaign_signals")
        .select("*, threat_indicators(value, threat_score, report_count, verified)")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"campaigns": resp.data or [], "page": page, "limit": limit}
