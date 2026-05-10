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
from app.core.ml.real.url_model import extract_structural_features, _url_entropy
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
    3. If not found → run URL ML model (BERT + structural features)
    4. If phishing detected → upsert indicator to DB
    """
    start = time.time()
    threat_hit = None
    domain = extract_domain(url)

    # Heuristic Allowlist: Top safe domains
    SAFE_DOMAINS = {
        "google.com", "youtube.com", "facebook.com", "twitter.com", "x.com",
        "instagram.com", "linkedin.com", "apple.com", "microsoft.com",
        "github.com", "amazon.com", "netflix.com", "wikipedia.org", "yahoo.com"
    }
    
    if domain and domain.lower() in SAFE_DOMAINS:
        elapsed = int((time.time() - start) * 1000)
        
        # Calculate real features for UI instead of zeroes
        struct_feats = extract_structural_features(url)
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url if url.startswith("http") else f"https://{url}")
            hostname = parsed.hostname or ""
            tld = "." + hostname.split(".")[-1] if "." in hostname else ""
        except:
            hostname = domain
            tld = ""

        return ChannelResult(
            channel="url",
            score=0.0,
            verdict=Verdict.legitimate,
            confidence=0.99,
            features={
                "source": "heuristic_allowlist",
                "domain": domain,
                "hostname": hostname,
                "tld": tld,
                "url_length": struct_feats.get("url_length", len(url)),
                "has_ip": bool(struct_feats.get("has_ip", 0)),
                "subdomain_count": struct_feats.get("subdomain_count", 0),
                "special_chars": struct_feats.get("special_char_count", 0),
                "entropy": _url_entropy(hostname),
                "bert_phishing_probability": 0.0
            },
            processing_time_ms=elapsed,
        ), None

    # Step 1: Threat indicator check
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
    if result.score >= 0.95 and domain:
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
    Web Visual Engine — Playwright screenshot + DOM analysis.
    Takes screenshot, parses DOM for suspicious elements,
    checks brand impersonation, uploads annotated screenshot.
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


async def run_voice_engine(
    input_text: str,
    channel: str = "voice",
    file_content: Optional[bytes] = None,
) -> ChannelResult:
    """
    Voice/SMS Engine:
    - Voice (with audio file): 3-stage deepfake detection
      (Acoustic Rules → Prosody NN → Neural AST)
    - SMS/text (no file): NLP analysis with vishing signal detection
    """
    start = time.time()
    model = await get_voice_model()
    result = await model.predict(input_text, channel=channel, file_content=file_content)
    elapsed = int((time.time() - start) * 1000)

    return ChannelResult(
        channel="voice",
        score=result.score,
        verdict=Verdict(result.verdict),
        confidence=result.confidence,
        features=result.features,
        processing_time_ms=elapsed,
    )
