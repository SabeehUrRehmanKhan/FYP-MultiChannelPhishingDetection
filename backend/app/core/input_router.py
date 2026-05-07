"""
Input Router — detects channel type and assigns/validates session.
First layer in the 5-layer pipeline.
"""
import re
import uuid
import logging
from typing import Optional, Tuple
from app.schemas.all import InputType, AnalyzeRequest
from app.db.supabase_client import get_supabase_admin
from app.cache.redis_client import cache_get, cache_set

logger = logging.getLogger(__name__)


def detect_input_type(raw_input: str) -> InputType:
    """
    Heuristically detect input type for the 'auto' mode.
    """
    text = raw_input.strip()

    # URL pattern (prioritize this)
    if re.match(r"^https?://", text) or re.match(r"^www\.", text) or ('.' in text and '/' in text and len(text.split()) == 1):
        return InputType.url

    # Email — has headers or is a long block with @ and some common words
    if re.search(r"^(From|Subject|To|Date|Message-ID):", text, re.MULTILINE | re.IGNORECASE):
        return InputType.email
    
    if '@' in text and ('Dear' in text or 'Hello' in text or 'Regards' in text or 'Click' in text):
        return InputType.email

    # SMS/Voice pattern (short text, maybe phone number)
    if len(text) < 300 and re.search(r"^\+?[\d\s\-().]{7,15}$", text[:20]):
        return InputType.sms

    # Default to email/nlp if it's long text
    if len(text) > 100:
        return InputType.email

    return InputType.sms


def extract_urls_from_email(email_body: str) -> list[str]:
    """
    Extract all URLs from an email body for Level-1 correlation.
    Email engine runs NLP; extracted URLs are also run through URL engine.
    """
    url_pattern = r"https?://[^\s<>\"'{}|\\^`\[\]]+"
    urls = re.findall(url_pattern, email_body, re.IGNORECASE)
    return list(set(urls))[:10]   # Cap at 10 to prevent abuse


def extract_domain(url: str) -> Optional[str]:
    """Extract root domain from URL for threat indicator lookups."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url if url.startswith("http") else f"https://{url}")
        hostname = parsed.hostname or ""
        parts = hostname.split(".")
        if len(parts) >= 2:
            return ".".join(parts[-2:])
        return hostname
    except Exception:
        return None


async def get_or_create_session(user_id: str, session_id: Optional[str]) -> str:
    """
    Return existing session or create a new one.
    Sessions are cached in Redis; persisted in Supabase.
    """
    if session_id:
        # Validate session belongs to this user
        cached = await cache_get(f"session:{session_id}")
        if cached and cached.get("user_id") == user_id:
            return session_id
        # Could be an old session — check DB
        supabase = get_supabase_admin()
        try:
            resp = (
                supabase.table("sessions")
                .select("id")
                .eq("id", session_id)
                .eq("user_id", user_id)
                .single()
                .execute()
            )
            if resp.data:
                await cache_set(f"session:{session_id}", {"user_id": user_id}, ttl=3600)
                return session_id
        except Exception:
            pass   # Session not found — create new

    # Create new session
    new_id = str(uuid.uuid4())
    supabase = get_supabase_admin()
    supabase.table("sessions").insert({
        "id": new_id,
        "user_id": user_id,
    }).execute()
    await cache_set(f"session:{new_id}", {"user_id": user_id}, ttl=3600)
    logger.info(f"New session created: {new_id} for user {user_id}")
    return new_id


def build_channel_tasks(request: AnalyzeRequest) -> list[dict]:
    """
    Determine which channel engines to run and with what inputs.
    Returns a list of task descriptors.
    """
    tasks = []
    
    # Auto-detection if requested
    effective_type = request.type
    if effective_type == InputType.auto:
        effective_type = detect_input_type(request.input)
        logger.info(f"Auto-detected input type: {effective_type}")

    if effective_type == InputType.email:
        tasks.append({"channel": "nlp", "input": request.input, "kwargs": {"channel": "email"}})
        # Level-1 correlation: also run URL engine on embedded URLs
        embedded_urls = extract_urls_from_email(request.input)
        for url in embedded_urls:
            tasks.append({"channel": "url", "input": url, "kwargs": {"source": "email_embedded"}})

    elif effective_type == InputType.url:
        tasks.append({"channel": "url", "input": request.input, "kwargs": {}})
        # Web engine will be conditionally added by correlation engine (cascade rule)

    elif effective_type == InputType.web:
        tasks.append({"channel": "url", "input": request.input, "kwargs": {}})
        tasks.append({"channel": "web", "input": request.input, "kwargs": {}})

    elif effective_type in (InputType.voice, InputType.sms):
        tasks.append({"channel": "voice", "input": request.input, "kwargs": {"channel": str(effective_type)}})

    return tasks
