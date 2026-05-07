"""
Mock NLP Model — rule-based placeholder for RoBERTa.
Used during development (USE_MOCK_MODELS=true).

⚠️  MODEL CHANGE POINT — REPLACE WITH:
    app/core/ml/real/nlp_model.py
    
    Real implementation should:
    - Load fine-tuned RoBERTa from ROBERTA_MODEL_PATH
    - Tokenize input with AutoTokenizer
    - Run forward pass → softmax → phishing probability
    - Extract attention weights as "signals" for explainability
    - Return features dict with: {
        "tokens_flagged": [...],
        "attention_peaks": [...],
        "urgency_score": float,
        "impersonation_score": float,
      }
    
    Model is channel-agnostic — same model handles email/SMS/voice transcript.
    Channel is passed as metadata only (for logging, not fed to model).
"""
import re
import logging
from app.core.ml.base_model import BasePhishModel, ModelOutput

logger = logging.getLogger(__name__)

# Weighted phishing keyword patterns
PHISHING_PATTERNS = [
    (r"\b(verify|confirm|validate)\s+your\s+(account|identity|password|details)\b", 0.3),
    (r"\b(urgent|immediately|expire[sd]?|suspend(ed)?|limited\s+time)\b", 0.2),
    (r"\b(click\s+here|click\s+below|click\s+the\s+link)\b", 0.15),
    (r"\b(bank|paypal|amazon|microsoft|apple|google|netflix)\b.*\b(account|login|sign.?in)\b", 0.35),
    (r"\b(password|ssn|social\s+security|credit\s+card|cvv)\b", 0.25),
    (r"\b(you\s+have\s+won|congratulations|prize|reward|gift\s+card)\b", 0.3),
    (r"\b(unusual\s+activity|suspicious\s+login|unauthorized\s+access)\b", 0.3),
    (r"http[s]?://(?!(?:www\.)?(?:google|microsoft|apple|amazon)\.com)\S+\.(tk|ml|ga|cf|gq|xyz|top)\b", 0.4),
    (r"\b(dear\s+customer|dear\s+user|valued\s+member)\b", 0.15),
    (r"\b(0\s*hours?|24\s*hours?|48\s*hours?)\s*(left|remaining|to\s+respond)\b", 0.25),
]

LEGIT_SIGNALS = [
    (r"\b(unsubscribe|privacy\s+policy|terms\s+of\s+service)\b", -0.1),
    (r"\b(invoice|order\s+#|tracking\s+number)\b", -0.05),
]


class MockNLPModel(BasePhishModel):
    """Rule-based NLP model for development."""

    async def load(self) -> None:
        logger.info("✅ MockNLPModel loaded (rule-based, no weights)")
        self._loaded = True

    async def predict(self, input_text: str, **kwargs) -> ModelOutput:
        channel = kwargs.get("channel", "unknown")
        text_lower = input_text.lower()

        score = 0.0
        signals = []

        for pattern, weight in PHISHING_PATTERNS:
            matches = re.findall(pattern, text_lower, re.IGNORECASE)
            if matches:
                score += weight
                signals.append({
                    "pattern": pattern,
                    "weight": weight,
                    "matches": matches[:3],   # cap at 3 examples
                })

        for pattern, weight in LEGIT_SIGNALS:
            if re.search(pattern, text_lower, re.IGNORECASE):
                score += weight

        score = max(0.0, min(1.0, score))
        confidence = 0.65 if score > 0.0 else 0.85   # mock: lower confidence when borderline

        return ModelOutput(
            score=score,
            confidence=confidence,
            verdict=self._score_to_verdict(score),
            features={
                "signals": signals,
                "text_length": len(input_text),
                "channel": channel,
                "urgency_keywords": len([s for s in signals if "urgent" in str(s)]),
            },
            model_version="mock-nlp-v1",
        )
