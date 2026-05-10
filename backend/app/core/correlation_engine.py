"""
Correlation Engine — 3-level cross-channel phishing signal aggregation.

Level 1 — Intra-Input:
    Email contains an embedded URL → URL engine also runs → scores combined.
    High URL score in an email elevates the overall email threat score.

Level 2 — Intra-Session:
    Same user session has reported multiple inputs with domain overlap.
    e.g. user received email + SMS both pointing to same domain → campaign signal.

Level 3 — Cross-User:
    3+ DIFFERENT users reported the same domain within CAMPAIGN_WINDOW_DAYS.
    → Flag as active phishing campaign regardless of individual scores.
"""
import logging
from typing import List, Optional
from app.schemas.all import ChannelResult, CorrelationUpdate, Verdict
from app.db.threat_indicators import get_campaign_domains
from app.core.input_router import extract_domain
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def level1_intra_input(
    channel_results: List[ChannelResult],
    raw_input: str,
) -> Optional[CorrelationUpdate]:
    """
    Level 1: If multiple channels ran on same input (e.g. email with embedded URL),
    check if URL score elevates or confirms email score.
    """
    url_results = [r for r in channel_results if r.channel == "url"]
    nlp_results = [r for r in channel_results if r.channel == "nlp"]

    if not url_results or not nlp_results:
        return None

    high_url_scores = [r for r in url_results if r.score >= 0.65]
    if not high_url_scores:
        return None

    max_url_score = max(r.score for r in high_url_scores)
    domains = []
    for r in high_url_scores:
        domain = r.features.get("hostname") or r.features.get("domain")
        if domain:
            domains.append(domain)

    return CorrelationUpdate(
        level=1,
        signal_type="embedded_url_confirms_email",
        evidence={
            "url_score": max_url_score,
            "nlp_score": nlp_results[0].score if nlp_results else None,
            "correlation": "high_score_url_in_email_body",
        },
        affected_domains=domains,
    )


async def level2_intra_session(
    session_id: str,
    current_domains: List[str],
    db_client,
) -> Optional[CorrelationUpdate]:
    """
    Level 2: Check if current analysis shares domains with recent analyses
    from the same session (same user, same browsing session).
    """
    if not current_domains or not session_id:
        return None

    try:
        resp = (
            db_client.table("analyses")
            .select("raw_input, final_verdict, created_at")
            .eq("session_id", session_id)
            .eq("final_verdict", "phishing")
            .limit(20)
            .execute()
        )
        previous_inputs = [row["raw_input"] for row in (resp.data or [])]
    except Exception as e:
        logger.warning(f"Level2 correlation DB error: {e}")
        return None

    overlapping_domains = []
    for domain in current_domains:
        for prev_input in previous_inputs:
            if domain.lower() in prev_input.lower():
                overlapping_domains.append(domain)
                break

    if not overlapping_domains:
        return None

    return CorrelationUpdate(
        level=2,
        signal_type="domain_overlap_in_session",
        evidence={
            "repeated_domains": overlapping_domains,
            "session_id": session_id,
            "previous_phishing_count": len(previous_inputs),
        },
        affected_domains=overlapping_domains,
    )


async def level3_cross_user(
    domains: List[str],
    analysis_id: str,
) -> Optional[CorrelationUpdate]:
    """
    Level 3: If 3+ different users reported the same domain within
    CAMPAIGN_WINDOW_DAYS → declare active phishing campaign.
    """
    if not domains:
        return None

    campaign_domains = []
    for domain in domains:
        user_count = await get_campaign_domains(domain)
        if user_count >= settings.campaign_min_reports:
            campaign_domains.append({"domain": domain, "user_count": user_count})

    if not campaign_domains:
        return None

    return CorrelationUpdate(
        level=3,
        signal_type="active_phishing_campaign",
        evidence={
            "domains": campaign_domains,
            "threshold": settings.campaign_min_reports,
            "window_days": settings.campaign_window_days,
        },
        affected_domains=[d["domain"] for d in campaign_domains],
        campaign_id=f"campaign_{campaign_domains[0]['domain'].replace('.', '_')}",
    )


def should_run_web_engine(url_result: Optional[ChannelResult]) -> bool:
    """
    Cascade Rule: skip web engine (expensive, 3-5s) if URL score already >= threshold.
    URL score >= CASCADE_THRESHOLD → definitely phishing, no need to screenshot.
    URL score < CASCADE_THRESHOLD  → run web engine for visual confirmation.
    """
    if url_result is None:
        return False
    return url_result.score < settings.cascade_threshold


def aggregate_final_score(channel_results: List[ChannelResult]) -> tuple[float, str]:
    """
    Combine channel scores into a final verdict.
    Weighted average — URL and Web results weighted higher than NLP alone.
    
    ⚠️  MODEL CHANGE POINT:
        When real models are integrated, tune these weights based on
        validation accuracy of each model on the verified dataset.
    """
    if not channel_results:
        return 0.0, "unknown"

    weights = {"url": 0.40, "web": 0.35, "nlp": 0.25, "voice": 0.25}
    total_weight = 0.0
    weighted_score = 0.0

    for result in channel_results:
        if result.cascade_skipped:
            continue
        w = weights.get(result.channel, 0.25)
        weighted_score += result.score * w
        total_weight += w

    if total_weight == 0:
        return 0.0, "unknown"

    final_score = weighted_score / total_weight

    # If ANY channel has very high confidence phishing, escalate
    max_score = max(r.score for r in channel_results if not r.cascade_skipped)
    if max_score >= 0.90:
        final_score = max(final_score, max_score * 0.95)

    if final_score >= 0.95:
        verdict = "phishing"
    elif final_score >= 0.65:
        verdict = "suspicious"
    elif final_score >= 0.0:
        verdict = "legitimate"
    else:
        verdict = "unknown"

    return round(final_score, 4), verdict
