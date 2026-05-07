"""
Mock Web Model — placeholder for XGB + pHash CNN visual analysis.
Used during development (USE_MOCK_MODELS=true).

⚠️  MODEL CHANGE POINT — REPLACE WITH:
    app/core/ml/real/web_model.py
    
    Real implementation should:
    - Take a URL as input
    - Use playwright (async) to screenshot the page
    - Compute pHash of screenshot
    - Compare pHash to known phishing page database
    - Also run CNN on screenshot for brand logo detection
    - XGBoost on DOM/content features (form fields, redirects, scripts)
    - features dict should include: {
        "screenshot_path": str,
        "phash": str,
        "phash_similarity_score": float,
        "matched_template": str or None,
        "dom_features": {
            "has_password_field": bool,
            "external_js_count": int,
            "redirect_count": int,
            "hidden_elements": int,
        },
        "brand_detected": str or None,
        "brand_confidence": float,
      }
    
    Install deps:
    - playwright: `pip install playwright && playwright install chromium`
    - imagehash: `pip install imagehash Pillow`
"""
import logging
import random
from app.core.ml.base_model import BasePhishModel, ModelOutput

logger = logging.getLogger(__name__)


class MockWebModel(BasePhishModel):
    """Mock visual web analysis — returns deterministic score based on URL patterns."""

    async def load(self) -> None:
        logger.info("✅ MockWebModel loaded (no screenshot, mock analysis)")
        self._loaded = True

    async def predict(self, input_text: str, **kwargs) -> ModelOutput:
        """
        Mock: derive a plausible score from the URL string itself.
        Real model would actually load the page and analyze visually.
        """
        url = input_text.lower()
        score = 0.0

        # Very rough visual heuristics on URL alone (mock only)
        if any(brand in url for brand in ["paypal", "amazon", "apple", "microsoft", "google"]):
            if not any(f"{brand}.com" in url for brand in ["paypal", "amazon", "apple", "microsoft", "google"]):
                score = 0.78   # Brand name but not on official domain → likely spoofing

        if score == 0.0:
            # Slightly randomized for mock variety
            score = round(random.uniform(0.1, 0.35), 2)

        return ModelOutput(
            score=score,
            confidence=0.55,   # Low confidence — mock can't actually see the page
            verdict=self._score_to_verdict(score),
            features={
                "screenshot_taken": False,
                "mock": True,
                "note": "Real web model will screenshot and do visual pHash + CNN analysis",
                # ⚠️  MODEL CHANGE POINT: these fields will be populated by real model
                "phash": None,
                "phash_similarity_score": None,
                "matched_template": None,
                "dom_features": {},
                "brand_detected": None,
            },
            model_version="mock-web-v1",
        )
