from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.db.supabase_client import get_supabase_admin
from app.schemas.auth import UserProfile
import logging

logger = logging.getLogger(__name__)
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> UserProfile:
    """
    Validate Supabase JWT and return user profile with role.
    Attach to any route that requires authentication.
    """
    token = credentials.credentials
    supabase = get_supabase_admin()

    try:
        # Validate token with Supabase — raises if invalid/expired
        response = supabase.auth.get_user(token)
        auth_user = response.user
        if not auth_user:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Fetch profile with role from our profiles table
        profile_resp = (
            supabase.table("profiles")
            .select("*")
            .eq("id", str(auth_user.id))
            .execute()
        )

        if not profile_resp or not profile_resp.data:
            # Profile wasn't created by trigger, create it now as fallback
            logger.info(f"Creating missing profile for user {auth_user.id}")
            new_profile = {
                "id": str(auth_user.id),
                "email": auth_user.email,
                "display_name": (auth_user.user_metadata.get("full_name") or auth_user.user_metadata.get("display_name") or auth_user.email.split("@")[0]) if auth_user.user_metadata else (auth_user.email.split("@")[0] if auth_user.email else "User"),
                "avatar_url": auth_user.user_metadata.get("avatar_url") if auth_user.user_metadata else None,
                "role": "user"
            }
            create_resp = supabase.table("profiles").insert(new_profile).execute()
            if not create_resp or not create_resp.data:
                raise HTTPException(status_code=404, detail="User profile not found and could not be created")
            return UserProfile(**create_resp.data[0])

        return UserProfile(**profile_resp.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )


async def require_admin(user: UserProfile = Depends(get_current_user)) -> UserProfile:
    """Route guard — admin only."""
    if user.role not in ("admin",):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_moderator(user: UserProfile = Depends(get_current_user)) -> UserProfile:
    """Route guard — moderator or admin."""
    if user.role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Moderator access required")
    return user
