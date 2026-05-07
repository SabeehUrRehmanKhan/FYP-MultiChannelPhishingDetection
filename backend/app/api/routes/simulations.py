"""
Simulations & Awareness Activities Routes

User endpoints:
- GET  /simulations                    : list active simulations
- GET  /simulations/{id}               : get one simulation (no explanation yet)
- POST /simulations/{id}/complete      : submit answer → get score + explanation
- GET  /activities                     : list active activities
- GET  /activities/{id}                : get one activity
- POST /activities/{id}/submit         : submit answers → get score
- GET  /progress                       : current user's completion history

Admin endpoints:
- POST   /simulations/admin            : create simulation
- PUT    /simulations/admin/{id}       : update simulation
- DELETE /simulations/admin/{id}       : deactivate simulation
- POST   /activities/admin             : create activity
- PUT    /activities/admin/{id}        : update activity
"""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from app.auth.dependencies import get_current_user, require_admin, require_moderator
from app.schemas.all import (
    SimulationCreate, SimulationOut, SimulationCompleteRequest, SimulationCompleteResponse,
    ActivityCreate, ActivityOut, ActivitySubmit, ActivityResult, Difficulty
)
from app.schemas.auth import UserProfile
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter()


# ─────────────────────────────────────────────
# SIMULATIONS — User endpoints
# ─────────────────────────────────────────────

@router.get("")
async def list_simulations(
    difficulty: str = None,
    sim_type: str = None,
    user: UserProfile = Depends(get_current_user),
):
    """List all active simulations. Exclude explanation field."""
    supabase = get_supabase_admin()

    query = (
        supabase.table("simulations")
        # Exclude explanation — revealed only after completion
        .select("id, title, sim_type, content, difficulty, hints, active, created_at")
        .eq("active", True)
        .order("created_at", desc=True)
    )

    if difficulty:
        query = query.eq("difficulty", difficulty)
    if sim_type:
        query = query.eq("sim_type", sim_type)

    resp = query.execute()

    # Mark which ones the user has already completed
    progress_resp = (
        supabase.table("user_progress")
        .select("content_id, score")
        .eq("user_id", user.id)
        .eq("content_type", "simulation")
        .execute()
    )
    progress_map = {row["content_id"]: row["score"] for row in (progress_resp.data or [])}

    simulations = []
    for sim in (resp.data or []):
        simulations.append({
            **sim,
            "completed": sim["id"] in progress_map,
            "last_score": progress_map.get(sim["id"])
        })

    return {"simulations": simulations}


@router.get("/{sim_id}")
async def get_simulation(
    sim_id: str,
    user: UserProfile = Depends(get_current_user),
):
    """Get single simulation content. Explanation is hidden until completion."""
    supabase = get_supabase_admin()

    try:
        sim = (
            supabase.table("simulations")
            .select("id, title, sim_type, content, difficulty, hints, active")
            .eq("id", sim_id)
            .eq("active", True)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Simulation not found")

    return sim.data


@router.post("/{sim_id}/complete")
async def complete_simulation(
    sim_id: str,
    body: SimulationCompleteRequest,
    user: UserProfile = Depends(get_current_user),
):
    """
    User submits their answer (phishing/legitimate).
    Returns whether they were correct + full explanation + red flags.
    """
    supabase = get_supabase_admin()

    try:
        sim = (
            supabase.table("simulations")
            .select("*")
            .eq("id", sim_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Simulation not found")

    sim_data = sim.data
    # Check top-level OR inside content (Admin tool saves it in content now)
    correct_answer = sim_data.get("correct_answer") or sim_data.get("content", {}).get("correct_answer", "phishing")
    user_answer = body.answer.lower().strip()
    correct = user_answer.lower() == correct_answer.lower()
    score = 100 if correct else 0
    if correct and body.time_taken_seconds and body.time_taken_seconds < 30:
        score = 120   # Speed bonus

    # Save progress
    supabase.table("user_progress").upsert({
        "user_id": user.id,
        "content_id": sim_id,
        "content_type": "simulation",
        "score": score,
        "completed_at": datetime.utcnow().isoformat(),
        "answers": {"answer": user_answer, "time_taken": body.time_taken_seconds},
    }).execute()

    return SimulationCompleteResponse(
        correct=correct,
        score=score,
        explanation=sim_data.get("explanation", ""),
        red_flags=sim_data.get("content", {}).get("red_flags", []),
    )


# ─────────────────────────────────────────────
# ACTIVITIES — User endpoints
# ─────────────────────────────────────────────

@router.get("/activities/list")
async def list_activities(
    difficulty: str = None,
    activity_type: str = None,
    user: UserProfile = Depends(get_current_user),
):
    """List all active awareness activities."""
    supabase = get_supabase_admin()

    query = (
        supabase.table("awareness_activities")
        .select("id, title, activity_type, difficulty, questions, active, created_at")
        .eq("active", True)
        .order("created_at", desc=True)
    )

    if difficulty:
        query = query.eq("difficulty", difficulty)
    if activity_type:
        query = query.eq("activity_type", activity_type)

    resp = query.execute()

    progress_resp = (
        supabase.table("user_progress")
        .select("content_id, score")
        .eq("user_id", user.id)
        .eq("content_type", "activity")
        .execute()
    )
    progress_map = {row["content_id"]: row["score"] for row in (progress_resp.data or [])}

    activities = []
    for act in (resp.data or []):
        activities.append({
            **act,
            "completed": act["id"] in progress_map,
            "last_score": progress_map.get(act["id"]),
        })

    return {"activities": activities}


@router.get("/activities/{activity_id}")
async def get_activity(
    activity_id: str,
    user: UserProfile = Depends(get_current_user),
):
    supabase = get_supabase_admin()
    try:
        act = (
            supabase.table("awareness_activities")
            .select("*")
            .eq("id", activity_id)
            .eq("active", True)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Activity not found")
    return act.data


@router.post("/activities/{activity_id}/submit")
async def submit_activity(
    activity_id: str,
    body: ActivitySubmit,
    user: UserProfile = Depends(get_current_user),
):
    """Submit activity answers. Returns score and correct answers."""
    supabase = get_supabase_admin()

    try:
        act = (
            supabase.table("awareness_activities")
            .select("*")
            .eq("id", activity_id)
            .single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Activity not found")

    questions = act.data.get("questions", [])
    correct_count = 0
    feedback_msgs = []
    correct_answers = []

    for i, question in enumerate(questions):
        correct_ans = question.get("correct_answer")
        correct_answers.append(correct_ans)
        user_ans = body.answers[i] if i < len(body.answers) else None

        if user_ans == correct_ans:
            correct_count += 1
            feedback_msgs.append(f"Q{i+1}: ✓ Correct!")
        else:
            feedback_msgs.append(f"Q{i+1}: ✗ Correct answer: {correct_ans}. {question.get('explanation', '')}")

    total = len(questions)
    percentage = round((correct_count / total * 100), 1) if total > 0 else 0

    supabase.table("user_progress").upsert({
        "user_id": user.id,
        "content_id": activity_id,
        "content_type": "activity",
        "score": correct_count,
        "answers": {"submitted": body.answers},
    }).execute()

    return ActivityResult(
        score=correct_count,
        total=total,
        percentage=percentage,
        correct_answers=correct_answers,
        feedback=feedback_msgs,
    )


@router.get("/progress/me")
async def get_my_progress(user: UserProfile = Depends(get_current_user)):
    """Get current user's simulation + activity completion history."""
    supabase = get_supabase_admin()
    resp = (
        supabase.table("user_progress")
        .select("*")
        .eq("user_id", user.id)
        .order("completed_at", desc=True)
        .execute()
    )
    return {"progress": resp.data or []}


# ─────────────────────────────────────────────
# ADMIN — Simulation & Activity CRUD
# ─────────────────────────────────────────────

@router.post("/admin/simulations")
async def create_simulation(
    body: SimulationCreate,
    admin: UserProfile = Depends(require_moderator),
):
    supabase = get_supabase_admin()
    resp = (
        supabase.table("simulations")
        .insert({**body.dict(), "created_by": admin.id})
        .execute()
    )
    return resp.data[0]


@router.put("/admin/simulations/{sim_id}")
async def update_simulation(
    sim_id: str,
    body: SimulationCreate,
    admin: UserProfile = Depends(require_moderator),
):
    supabase = get_supabase_admin()
    resp = (
        supabase.table("simulations")
        .update({**body.dict(), "updated_at": datetime.utcnow().isoformat()})
        .eq("id", sim_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return resp.data[0]


@router.delete("/admin/simulations/{sim_id}")
async def deactivate_simulation(
    sim_id: str,
    admin: UserProfile = Depends(require_moderator),
):
    supabase = get_supabase_admin()
    supabase.table("simulations").update({"active": False}).eq("id", sim_id).execute()
    return {"status": "deactivated"}


@router.post("/admin/activities")
async def create_activity(
    body: ActivityCreate,
    admin: UserProfile = Depends(require_moderator),
):
    supabase = get_supabase_admin()
    resp = (
        supabase.table("awareness_activities")
        .insert({**body.dict(), "created_by": admin.id})
        .execute()
    )
    return resp.data[0]


@router.put("/admin/activities/{activity_id}")
async def update_activity(
    activity_id: str,
    body: ActivityCreate,
    admin: UserProfile = Depends(require_moderator),
):
    supabase = get_supabase_admin()
    resp = (
        supabase.table("awareness_activities")
        .update({**body.dict(), "updated_at": datetime.utcnow().isoformat()})
        .eq("id", activity_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Activity not found")
    return resp.data[0]
