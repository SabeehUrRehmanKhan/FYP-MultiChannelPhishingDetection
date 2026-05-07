"""
Auth Routes

- GET  /auth/me   : Return current user's profile (used by frontend on every load)
- PUT  /auth/me   : Update current user's display_name / avatar_url
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.auth.dependencies import get_current_user
from app.schemas.auth import UserProfile
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter()


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


@router.get("/me", response_model=UserProfile)
async def get_me(user: UserProfile = Depends(get_current_user)):
    """
    Return current authenticated user's profile.
    Frontend calls this on every session to hydrate the profile context.
    """
    return user


@router.put("/me", response_model=UserProfile)
async def update_me(
    body: ProfileUpdate,
    user: UserProfile = Depends(get_current_user),
):
    """
    Update current user's display name or avatar URL.
    Used when a user edits their profile settings.
    """
    supabase = get_supabase_admin()

    update_data = {}
    if body.display_name is not None:
        update_data["display_name"] = body.display_name.strip()
    if body.avatar_url is not None:
        update_data["avatar_url"] = body.avatar_url

    if not update_data:
        return user

    resp = (
        supabase.table("profiles")
        .update(update_data)
        .eq("id", user.id)
        .execute()
    )

    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to update profile")

    return UserProfile(**resp.data[0])
