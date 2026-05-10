import asyncio
import json
import uuid
import time
import logging
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from fastapi.responses import StreamingResponse

from app.schemas.all import (
    AnalyzeRequest, ChannelResult, FinalVerdict, Verdict,
    ThreatIndicatorHit, CorrelationUpdate, InputType
)
from app.auth.dependencies import get_current_user
from app.schemas.auth import UserProfile
from app.cache.redis_client import check_rate_limit, store_analysis_state
from app.db.supabase_client import get_supabase_admin
from app.db.threat_indicators import check_indicator, upsert_indicator
from app.core.input_router import (
    get_or_create_session, build_channel_tasks, extract_domain, extract_urls_from_email
)
from app.core.channels.engines import run_url_engine, run_nlp_engine, run_web_engine, run_voice_engine
from app.core.correlation_engine import (
    level1_intra_input, level2_intra_session, level3_cross_user,
    should_run_web_engine, aggregate_final_score
)
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter()


def sse_event(event_name: str, data: dict) -> str:
    """Format a single SSE event string."""
    payload = json.dumps(data, default=str)
    return f"event: {event_name}\ndata: {payload}\n\n"


async def analysis_stream(
    request: AnalyzeRequest,
    user: UserProfile,
    file_content: Optional[bytes] = None,
) -> AsyncGenerator[str, None]:
    """
    Core SSE generator — yields events as analysis progresses.
    """
    analysis_id = str(uuid.uuid4())
    start_time = time.time()
    channel_results: list[ChannelResult] = []
    threat_hits: list[ThreatIndicatorHit] = []
    supabase = get_supabase_admin()

    try:
        # ── Step 1: Session ──────────────────────────────────────────
        session_id = await get_or_create_session(user.id, request.session_id)

        # ── Step 1.5: File Processing (Voice) ────────────────────────
        if file_content:
            # Audio file → route to deepfake voice detection pipeline
            request.type = InputType.voice
            request.input = "[Audio file uploaded for deepfake analysis]"
            logger.info(f"Processing audio file ({len(file_content)} bytes) → deepfake pipeline")

        # ── Step 2: Threat Indicator Pre-Check ───────────────────────
        domains_to_check = []
        if request.type in (InputType.url, InputType.web):
            d = extract_domain(request.input)
            if d:
                domains_to_check.append(d)
        elif request.type == InputType.email:
            for url in extract_urls_from_email(request.input)[:3]:
                d = extract_domain(url)
                if d:
                    domains_to_check.append(d)

        for domain in domains_to_check:
            indicator = await check_indicator("domain", domain)
            if indicator and indicator.get("threat_score", 0) >= 0.70:
                hit = ThreatIndicatorHit(
                    indicator_type="domain",
                    value=domain,
                    threat_score=indicator["threat_score"],
                    verified=indicator.get("verified", False),
                    report_count=indicator.get("report_count", 1),
                )
                threat_hits.append(hit)
                yield sse_event("threat_indicator_hit", hit.dict())

        # ── Step 3: Build and run channel tasks ──────────────────────
        tasks = build_channel_tasks(request)
        url_result: ChannelResult = None

        async def run_task(task: dict):
            """Run a single channel task and stream its result."""
            nonlocal url_result
            channel = task["channel"]
            inp = task["input"]
            kwargs = task.get("kwargs", {})

            try:
                if channel == "url":
                    result, hit = await run_url_engine(inp)
                    if hit:
                        threat_hits.append(hit)
                        yield sse_event("threat_indicator_hit", hit.dict())
                    channel_results.append(result)
                    if url_result is None:
                        url_result = result
                    yield sse_event("channel_result", result.dict())

                elif channel == "nlp":
                    result = await run_nlp_engine(inp, channel=kwargs.get("channel", "email"))
                    channel_results.append(result)
                    yield sse_event("channel_result", result.dict())

                elif channel == "web":
                    result = await run_web_engine(inp)
                    channel_results.append(result)
                    yield sse_event("channel_result", result.dict())

                elif channel == "voice":
                    result = await run_voice_engine(
                        inp,
                        channel=kwargs.get("channel", "voice"),
                        file_content=file_content,
                    )
                    channel_results.append(result)
                    yield sse_event("channel_result", result.dict())

            except Exception as e:
                logger.error(f"Channel {channel} failed: {e}")
                yield sse_event("error", {"channel": channel, "message": str(e), "recoverable": True})

        # Run non-web tasks in parallel, stream as they complete
        non_web_tasks = [t for t in tasks if t["channel"] != "web"]
        web_tasks = [t for t in tasks if t["channel"] == "web"]

        # asyncio.gather for parallel execution
        async def parallel_runner():
            coros = [run_task(t) for t in non_web_tasks]
            # Collect all SSE events from all tasks
            all_events = []
            for coro in coros:
                async for event in coro:
                    all_events.append(event)
            return all_events

        events = await parallel_runner()
        for event in events:
            yield event

        # ── Step 4: Cascade check — web engine ───────────────────────
        cascade_skipped = False
        if web_tasks and not should_run_web_engine(url_result):
            cascade_skipped = True
            yield sse_event("channel_result", {
                "channel": "web",
                "cascade_skipped": True,
                "reason": f"URL score {url_result.score:.2f} >= cascade threshold {settings.cascade_threshold}",
            })
        elif web_tasks:
            async for event in run_task(web_tasks[0]):
                yield event

        # ── Step 5: Correlation ──────────────────────────────────────
        # Level 1: intra-input
        l1 = level1_intra_input(channel_results, request.input)
        if l1:
            yield sse_event("correlation_update", l1.dict())

        # Level 2: intra-session (async DB check)
        l2 = await level2_intra_session(session_id, domains_to_check, supabase)
        if l2:
            yield sse_event("correlation_update", l2.dict())

        # Level 3: cross-user campaign detection
        l3 = await level3_cross_user(domains_to_check, analysis_id)
        if l3:
            yield sse_event("correlation_update", l3.dict())

        # ── Step 6: Final Verdict ────────────────────────────────────
        final_score, final_verdict_str = aggregate_final_score(channel_results)
        # Escalate if campaign detected
        if l3:
            final_verdict_str = "phishing"
            final_score = max(final_score, 0.90)

        total_ms = int((time.time() - start_time) * 1000)
        verdict = FinalVerdict(
            verdict=Verdict(final_verdict_str),
            confidence=final_score,
            analysis_id=analysis_id,
            channels_run=[r.channel for r in channel_results],
            cascade_skipped=cascade_skipped,
            total_time_ms=total_ms,
            threat_indicator_hits=threat_hits,
            correlation=l3 or l2 or l1,
        )
        yield sse_event("final_verdict", verdict.dict())

        # ── Step 7: Persist to DB (async, non-blocking) ──────────────
        asyncio.create_task(
            persist_analysis(
                analysis_id=analysis_id,
                session_id=session_id,
                user_id=user.id,
                request=request,
                verdict=verdict,
                channel_results=channel_results,
                supabase=supabase,
            )
        )

    except Exception as e:
        logger.error(f"Analysis stream failed: {e}", exc_info=True)
        yield sse_event("error", {"message": "Analysis failed", "detail": str(e), "recoverable": False})


async def persist_analysis(
    analysis_id: str,
    session_id: str,
    user_id: str,
    request: AnalyzeRequest,
    verdict: FinalVerdict,
    channel_results: list[ChannelResult],
    supabase,
):
    """Persist completed analysis + features to Supabase. Runs after SSE stream closes."""
    try:
        # analyses table
        supabase.table("analyses").insert({
            "id": analysis_id,
            "session_id": session_id,
            "user_id": user_id,
            "input_type": request.type.value,
            "raw_input": request.input[:10000],   # truncate for storage
            "final_verdict": verdict.verdict,
            "confidence": verdict.confidence,
            "channels_run": verdict.channels_run,
            "cascade_skip": verdict.cascade_skipped,
        }).execute()

        # features table — one row per channel
        for result in channel_results:
            if not result.cascade_skipped:
                supabase.table("features").insert({
                    "analysis_id": analysis_id,
                    "channel": result.channel,
                    "score": result.score,
                    "features": result.features,
                    "model_ver": result.features.get("model_version", "unknown"),
                }).execute()

        # Update threat indicators for phishing results
        if verdict.verdict == "phishing":
            for result in channel_results:
                domain = result.features.get("hostname") or result.features.get("domain")
                if domain and result.score >= 0.95:
                    await upsert_indicator("domain", domain, result.score, source="ml_model")

        logger.info(f"Analysis {analysis_id} persisted — verdict: {verdict.verdict}")
    except Exception as e:
        logger.error(f"Failed to persist analysis {analysis_id}: {e}")


@router.post("/stream")
async def analyze_stream_route(
    input: str = Form(None),
    type: InputType = Form(InputType.auto),
    session_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: UserProfile = Depends(get_current_user),
):
    """
    POST /analyze/stream
    
    Streams analysis results via SSE. Supports Multipart (Form/File) for audio uploads.
    """
    # Rate limit check
    allowed = await check_rate_limit(
        user.id, "analyze",
        limit=settings.rate_limit_analyses_per_minute,
        window_seconds=60,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 20 analyses per minute.")

    # 5MB limit check
    file_content = None
    if file:
        file_content = await file.read()
        if len(file_content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large. Maximum size is 5MB.")

    # Construct request object for internal logic
    request = AnalyzeRequest(
        input=input or "",
        type=type,
        session_id=session_id
    )

    return StreamingResponse(
        analysis_stream(request, user, file_content),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # Disable nginx buffering for SSE
            "Connection": "keep-alive",
        },
    )
