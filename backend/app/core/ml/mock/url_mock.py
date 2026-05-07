"""
Mock URL Model — rule-based placeholder for XGB + BiLSTM.
Used during development (USE_MOCK_MODELS=true).

⚠️  MODEL CHANGE POINT — REPLACE WITH:
    app/core/ml/real/url_model.py
    
    Real implementation should:
    - Extract URL features (lexical, host-based, content-based)
    - Feed lexical features → XGBoost
    - Feed character sequence → BiLSTM
    - Ensemble both outputs → final score
    - features dict should include: {
        "url_length": int,
        "num_subdomains": int,
        "has_ip": bool,
        "tld": str,
        "entropy": float,
        "xgb_score": float,
        "bilstm_score": float,
        "suspicious_keywords": [...],
        "redirect_chain": [...],
      }
"""
import re
import logging
import math
from urllib.parse import urlparse
from app.core.ml.base_model import BasePhishModel, ModelOutput

logger = logging.getLogger(__name__)

SUSPICIOUS_TLDS = {".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".click", ".link", ".work"}
SUSPICIOUS_KEYWORDS = ["login", "signin", "verify", "account", "secure", "update",
                       "banking", "paypal", "amazon", "microsoft", "apple", "confirm",
                       "password", "credential", "wallet", "support"]
BRAND_SPOOFS = ["paypa1", "amaz0n", "micros0ft", "g00gle", "app1e", "netfl1x"]


def _url_entropy(url: str) -> float:
    """Shannon entropy — high entropy subdomain = likely DGA domain."""
    if not url:
        return 0.0
    freq = {}
    for c in url:
        freq[c] = freq.get(c, 0) + 1
    length = len(url)
    return -sum((f / length) * math.log2(f / length) for f in freq.values())


class MockURLModel(BasePhishModel):
    """Rule-based URL analysis for development."""

    async def load(self) -> None:
        logger.info("✅ MockURLModel loaded (rule-based, no weights)")
        self._loaded = True

    async def predict(self, input_text: str, **kwargs) -> ModelOutput:
        url = input_text.strip()
        score = 0.0
        flags = []

        try:
            parsed = urlparse(url if url.startswith("http") else f"https://{url}")
            hostname = parsed.hostname or ""
            path = parsed.path or ""
            full = url.lower()

            # TLD check
            tld = "." + hostname.split(".")[-1] if "." in hostname else ""
            if tld in SUSPICIOUS_TLDS:
                score += 0.4
                flags.append(f"suspicious_tld:{tld}")

            # IP address as hostname
            if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", hostname):
                score += 0.45
                flags.append("ip_as_hostname")

            # URL length
            if len(url) > 75:
                score += 0.1
                flags.append(f"long_url:{len(url)}")
            if len(url) > 150:
                score += 0.15
                flags.append("very_long_url")

            # Excessive subdomains
            subdomain_count = len(hostname.split(".")) - 2
            if subdomain_count > 2:
                score += 0.15 * min(subdomain_count - 2, 3)
                flags.append(f"subdomains:{subdomain_count}")

            # Suspicious keywords in URL
            matched_keywords = [kw for kw in SUSPICIOUS_KEYWORDS if kw in full]
            score += len(matched_keywords) * 0.08
            if matched_keywords:
                flags.append(f"keywords:{matched_keywords}")

            # Brand spoofing
            for spoof in BRAND_SPOOFS:
                if spoof in full:
                    score += 0.5
                    flags.append(f"brand_spoof:{spoof}")

            # @ symbol in URL (classic phishing trick)
            if "@" in url:
                score += 0.45
                flags.append("at_symbol_in_url")

            # Entropy (high = DGA domain)
            entropy = _url_entropy(hostname)
            if entropy > 3.8:
                score += 0.2
                flags.append(f"high_entropy:{entropy:.2f}")

            # HTTPS check (not definitive but a signal)
            if not url.startswith("https"):
                score += 0.1
                flags.append("no_https")

            # Typosquatting patterns (hyphens with brand names)
            if re.search(r"(paypal|amazon|apple|google|microsoft)-\w+\.\w+", full):
                score += 0.4
                flags.append("typosquatting_pattern")

        except Exception as e:
            logger.warning(f"URL parse error: {e}")
            score = 0.5
            flags.append("parse_error")

        score = max(0.0, min(1.0, score))

        return ModelOutput(
            score=score,
            confidence=0.75,
            verdict=self._score_to_verdict(score),
            features={
                "url_length": len(url),
                "hostname": hostname,
                "tld": tld,
                "subdomain_count": subdomain_count if "hostname" in dir() else 0,
                "entropy": round(entropy, 3) if "entropy" in dir() else 0,
                "flags": flags,
                "has_ip": "ip_as_hostname" in flags,
                "has_at_symbol": "@" in url,
            },
            model_version="mock-url-v1",
        )
