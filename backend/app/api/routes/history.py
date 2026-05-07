"""
History Routes
- GET /history            : paginated analysis history for current user
- GET /history/{id}       : full detail for one analysis (all channel scores + features)
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from app.auth.dependencies import get_current_user
from app.schemas.auth import UserProfile
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def get_history(
    page: int = 1,
    limit: int = 20,
    verdict: str = None,       # filter by 'phishing'|'legitimate'|'suspicious'
    input_type: str = None,    # filter by 'url'|'email'|'web'|'voice'|'sms'
    user: UserProfile = Depends(get_current_user),
):
    """
    Paginated analysis history for the current user.
    Supports filtering by verdict and input_type.
    """
    supabase = get_supabase_admin()
    offset = (page - 1) * limit

    query = (
        supabase.table("analyses")
        .select("id, input_type, raw_input, final_verdict, confidence, channels_run, cascade_skip, created_at")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
    )

    if verdict:
        query = query.eq("final_verdict", verdict)
    if input_type:
        query = query.eq("input_type", input_type)

    resp = query.range(offset, offset + limit - 1).execute()

    # Truncate raw_input for list view
    items = []
    for row in (resp.data or []):
        items.append({
            **row,
            "raw_input_preview": row["raw_input"][:120] + "..." if len(row.get("raw_input", "")) > 120 else row.get("raw_input", ""),
        })

    return {
        "analyses": items,
        "page": page,
        "limit": limit,
    }


@router.get("/{analysis_id}")
async def get_analysis_detail(
    analysis_id: str,
    user: UserProfile = Depends(get_current_user),
):
    """
    Full detail for a single analysis.
    Returns analysis record + all channel feature rows + any feedback submitted.
    """
    supabase = get_supabase_admin()

    # Fetch analysis — enforce ownership
    try:
        analysis = (
            supabase.table("analyses")
            .select("*")
            .eq("id", analysis_id)
            .eq("user_id", user.id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Channel features
    features = (
        supabase.table("features")
        .select("*")
        .eq("analysis_id", analysis_id)
        .execute()
    )

    # Campaign signals (if any)
    campaigns = (
        supabase.table("campaign_signals")
        .select("*")
        .eq("analysis_id", analysis_id)
        .execute()
    )

    # User's own feedback on this analysis
    feedback = (
        supabase.table("feedback")
        .select("id, user_verdict, status, created_at")
        .eq("analysis_id", analysis_id)
        .eq("submitted_by", user.id)
        .execute()
    )

    return {
        **analysis.data,
        "channel_features": features.data or [],
        "campaign_signals": campaigns.data or [],
        "feedback": feedback.data[0] if feedback.data else None,
    }
