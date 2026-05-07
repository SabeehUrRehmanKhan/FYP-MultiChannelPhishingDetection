"""
Feedback Routes
- POST /feedback           : user submits correction on an analysis
- GET  /feedback           : admin/moderator views pending queue
- PATCH /feedback/{id}/approve : admin approves → adds to verified_dataset
- PATCH /feedback/{id}/reject  : admin rejects
"""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from app.auth.dependencies import get_current_user, require_moderator
from app.schemas.all import FeedbackCreate, FeedbackOut, FeedbackReview, FeedbackStatus
from app.schemas.auth import UserProfile
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=FeedbackOut)
async def submit_feedback(
    body: FeedbackCreate,
    user: UserProfile = Depends(get_current_user),
):
    """Submit a correction on a completed analysis."""
    supabase = get_supabase_admin()

    # Verify analysis belongs to this user
    try:
        analysis = (
            supabase.table("analyses")
            .select("id, user_id")
            .eq("id", body.analysis_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Analysis not found")

    if analysis.data["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Cannot submit feedback on another user's analysis")

    # Check not already submitted
    existing = (
        supabase.table("feedback")
        .select("id")
        .eq("analysis_id", body.analysis_id)
        .eq("submitted_by", user.id)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Feedback already submitted for this analysis")

    resp = (
        supabase.table("feedback")
        .insert({
            "analysis_id": body.analysis_id,
            "submitted_by": user.id,
            "user_verdict": body.user_verdict,
            "notes": body.notes,
            "status": "pending",
        })
        .execute()
    )
    return FeedbackOut(**resp.data[0])


@router.get("")
async def list_feedback(
    status: str = "pending",
    page: int = 1,
    limit: int = 20,
    user: UserProfile = Depends(require_moderator),
):
    """Get feedback queue — moderator/admin only."""
    supabase = get_supabase_admin()
    offset = (page - 1) * limit

    resp = (
        supabase.table("feedback")
        .select("*, analyses(input_type, raw_input, final_verdict)")
        .eq("status", status)
        .order("created_at", desc=False)   # oldest first for fairness
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"feedback": resp.data, "page": page, "limit": limit}


@router.patch("/{feedback_id}/approve")
async def approve_feedback(
    feedback_id: str,
    body: FeedbackReview,
    admin: UserProfile = Depends(require_moderator),
):
    """
    Approve feedback → mark as approved + insert to verified_dataset.
    Admin can override the user's verdict (e.g. if user was wrong about a legit email).
    """
    supabase = get_supabase_admin()

    try:
        fb = (
            supabase.table("feedback")
            .select("*, analyses(*)")
            .eq("id", feedback_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Feedback not found")

    if fb.data["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Feedback already {fb.data['status']}")

    # Determine true label — admin override takes precedence
    true_label = str(body.override_label) if body.override_label else fb.data["user_verdict"]
    analysis = fb.data.get("analyses", {})

    # Get features snapshot
    features_resp = (
        supabase.table("features")
        .select("*")
        .eq("analysis_id", fb.data["analysis_id"])
        .execute()
    )
    features_snapshot = features_resp.data

    # Insert to verified_dataset
    supabase.table("verified_dataset").insert({
        "feedback_id": feedback_id,
        "analysis_id": fb.data["analysis_id"],
        "input_type": analysis.get("input_type", "unknown"),
        "raw_input": analysis.get("raw_input", ""),
        "true_label": true_label,
        "features": features_snapshot,
        "approved_by": admin.id,
    }).execute()

    # Update feedback status
    supabase.table("feedback").update({
        "status": "approved",
        "reviewed_by": admin.id,
        "reviewed_at": datetime.utcnow().isoformat(),
    }).eq("id", feedback_id).execute()

    logger.info(f"Feedback {feedback_id} approved by {admin.id} — label: {true_label}")
    return {"status": "approved", "true_label": true_label}


@router.patch("/{feedback_id}/reject")
async def reject_feedback(
    feedback_id: str,
    body: FeedbackReview,
    admin: UserProfile = Depends(require_moderator),
):
    """Reject feedback — won't be added to dataset."""
    supabase = get_supabase_admin()

    supabase.table("feedback").update({
        "status": "rejected",
        "reviewed_by": admin.id,
        "reviewed_at": datetime.utcnow().isoformat(),
        "notes": body.reason or "",
    }).eq("id", feedback_id).execute()

    return {"status": "rejected"}
