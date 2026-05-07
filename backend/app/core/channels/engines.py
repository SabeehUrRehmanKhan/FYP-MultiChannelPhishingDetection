"""
Channel Engines — one async function per channel.
Each engine: runs threat indicator check → runs ML model → returns ChannelResult.
All engines are run via asyncio.gather in the analyze route for parallel execution.
"""
import asyncio
import time
import logging
from typing import Optional

from app.core.ml.model_factory import get_nlp_model, get_url_model, get_web_model, get_voice_model
from app.db.threat_indicators import check_indicator, upsert_indicator
from app.core.input_router import extract_domain
from app.schemas.all import ChannelResult, Verdict, ThreatIndicatorHit
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def run_url_engine(url: str) -> tuple[ChannelResult, Optional[ThreatIndicatorHit]]:
    """
    URL Analysis Engine:
    1. Check threat_indicators DB for known phishing domain/URL
    2. If found → skip ML, return immediately with high confidence
    3. If not found → run URL ML model
    4. If phishing detected → upsert indicator to DB
    """
    start = time.time()
    threat_hit = None

    # Step 1: Threat indicator check
    domain = extract_domain(url)
    if domain:
        indicator = await check_indicator("domain", domain)
        if indicator and indicator.get("threat_score", 0) >= 0.7:
            elapsed = int((time.time() - start) * 1000)
            threat_hit = ThreatIndicatorHit(
                indicator_type="domain",
                value=domain,
                threat_score=indicator["threat_score"],
                verified=indicator.get("verified", False),
                report_count=indicator.get("report_count", 1),
            )
            return ChannelResult(
                channel="url",
                score=indicator["threat_score"],
                verdict=Verdict.phishing,
                confidence=0.95 if indicator.get("verified") else 0.80,
                features={"source": "threat_indicator_db", "domain": domain},
                processing_time_ms=elapsed,
            ), threat_hit

    # Step 2: ML model
    model = await get_url_model()
    result = await model.predict(url)
    elapsed = int((time.time() - start) * 1000)

    # Step 3: If phishing, upsert to threat indicators
    if result.score >= 0.75 and domain:
        asyncio.create_task(
            upsert_indicator("domain", domain, result.score, source="ml_model")
        )

    return ChannelResult(
        channel="url",
        score=result.score,
        verdict=Verdict(result.verdict),
        confidence=result.confidence,
        features=result.features,
        processing_time_ms=elapsed,
    ), threat_hit


async def run_nlp_engine(text: str, channel: str = "email") -> ChannelResult:
    """
    NLP Analysis Engine — channel-agnostic text analysis.
    Same RoBERTa model handles email bodies, SMS, and voice transcripts.
    Channel parameter is for logging only.
    """
    start = time.time()
    model = await get_nlp_model()
    result = await model.predict(text, channel=channel)
    elapsed = int((time.time() - start) * 1000)

    return ChannelResult(
        channel="nlp",
        score=result.score,
        verdict=Verdict(result.verdict),
        confidence=result.confidence,
        features=result.features,
        processing_time_ms=elapsed,
    )


async def run_web_engine(url: str) -> ChannelResult:
    """
    Web Visual Engine — screenshot + pHash + CNN analysis.
    
    ⚠️  MODEL CHANGE POINT:
        Real model will:
        - Launch headless Chromium via playwright
        - Screenshot the page
        - Compare to known phishing templates via pHash
        - Run CNN for brand logo detection
        - Extract DOM features
        
    Currently: mock returns a score based on URL heuristics only.
    """
    start = time.time()
    model = await get_web_model()
    result = await model.predict(url)
    elapsed = int((time.time() - start) * 1000)

    return ChannelResult(
        channel="web",
        score=result.score,
        verdict=Verdict(result.verdict),
        confidence=result.confidence,
        features=result.features,
        processing_time_ms=elapsed,
    )


async def run_voice_engine(input_text: str, channel: str = "voice") -> ChannelResult:
    """
    Voice/SMS Engine:
    - Voice: Whisper STT → transcript → NLP
    - SMS: direct NLP (no STT needed)
    
    ⚠️  MODEL CHANGE POINT:
        Real model will accept audio file path and run Whisper first.
        Currently: treats all input as plain text.
    """
    start = time.time()
    model = await get_voice_model()
    result = await model.predict(input_text, channel=channel)
    elapsed = int((time.time() - start) * 1000)

    return ChannelResult(
        channel="voice",
        score=result.score,
        verdict=Verdict(result.verdict),
        confidence=result.confidence,
        features=result.features,
        processing_time_ms=elapsed,
    )
