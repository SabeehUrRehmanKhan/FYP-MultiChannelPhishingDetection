from supabase import create_client, Client
from app.config import get_settings
from functools import lru_cache

settings = get_settings()


@lru_cache()
def get_supabase() -> Client:
    """
    Public client — uses anon key.
    For RLS-protected reads from frontend-facing endpoints.
    """
    return create_client(settings.supabase_url, settings.supabase_anon_key)


@lru_cache()
def get_supabase_admin() -> Client:
    """
    Service role client — bypasses RLS.
    Use ONLY in backend-to-backend operations (e.g. writing analyses, campaign detection).
    NEVER expose this key to frontend.
    """
    return create_client(settings.supabase_url, settings.supabase_service_key)
