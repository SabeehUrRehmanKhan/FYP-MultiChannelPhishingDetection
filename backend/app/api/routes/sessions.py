"""
Sessions Routes
- GET  /sessions          : list user's sessions
- GET  /sessions/{id}     : single session detail with analysis count
- DELETE /sessions/{id}   : close a session
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from app.auth.dependencies import get_current_user
from app.schemas.auth import UserProfile
from app.db.supabase_client import get_supabase_admin
from app.cache.redis_client import cache_delete

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def list_sessions(
    page: int = 1,
    limit: int = 20,
    user: UserProfile = Depends(get_current_user),
):
    """List all sessions for the current user, most recent first."""
    supabase = get_supabase_admin()
    offset = (page - 1) * limit

    resp = (
        supabase.table("sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("last_seen", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    # Attach analysis count per session
    sessions = []
    for session in (resp.data or []):
        count_resp = (
            supabase.table("analyses")
            .select("id", count="exact")
            .eq("session_id", session["id"])
            .execute()
        )
        sessions.append({
            **session,
            "analysis_count": count_resp.count or 0,
        })

    return {"sessions": sessions, "page": page, "limit": limit}


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    user: UserProfile = Depends(get_current_user),
):
    """Get single session with its analyses summary."""
    supabase = get_supabase_admin()

    try:
        session = (
            supabase.table("sessions")
            .select("*")
            .eq("id", session_id)
            .eq("user_id", user.id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Session not found")

    analyses = (
        supabase.table("analyses")
        .select("id, input_type, final_verdict, confidence, created_at")
        .eq("session_id", session_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )

    return {
        **session.data,
        "analyses": analyses.data or [],
    }


@router.delete("/{session_id}")
async def close_session(
    session_id: str,
    user: UserProfile = Depends(get_current_user),
):
    """Close/delete a session. Analyses are preserved."""
    supabase = get_supabase_admin()

    # Verify ownership
    try:
        supabase.table("sessions").select("id").eq("id", session_id).eq("user_id", user.id).single().execute()
    except Exception:
        raise HTTPException(status_code=404, detail="Session not found")

    supabase.table("sessions").delete().eq("id", session_id).execute()
    await cache_delete(f"session:{session_id}")

    return {"status": "deleted", "session_id": session_id}
