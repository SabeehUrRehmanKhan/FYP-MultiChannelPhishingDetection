"""
Base Model — all ML models (mock and real) must implement this interface.
The channel engines only ever call .predict() — they don't care about internals.

⚠️  MODEL CHANGE POINT:
    When adding a real model, subclass BasePhishModel and implement:
    - load()   : load weights/tokenizer from disk
    - predict(): return ModelOutput with score + features dict
    The features dict structure is flexible — update schemas/all.py
    ChannelResult.features to match your model's output fields.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, Optional


@dataclass
class ModelOutput:
    score: float                          # 0.0 (legit) → 1.0 (phishing)
    confidence: float                     # model's confidence in this score
    verdict: str                          # 'phishing' | 'legitimate' | 'suspicious' | 'unknown'
    features: Dict[str, Any] = field(default_factory=dict)
    model_version: str = "unknown"
    error: Optional[str] = None           # set if model failed gracefully

    def __post_init__(self):
        # Auto-assign verdict from score if not set
        if not self.verdict:
            if self.score >= 0.80:
                self.verdict = "phishing"
            elif self.score >= 0.50:
                self.verdict = "suspicious"
            else:
                self.verdict = "legitimate"


class BasePhishModel(ABC):
    """Abstract base for all PhishGuard ML models."""

    def __init__(self):
        self._loaded = False

    @abstractmethod
    async def load(self) -> None:
        """Load model weights, tokenizers, etc. Called once on startup."""
        ...

    @abstractmethod
    async def predict(self, input_text: str, **kwargs) -> ModelOutput:
        """
        Run inference on input_text.
        kwargs: channel-specific extras (e.g. screenshot_path for web model)
        Returns ModelOutput.
        """
        ...

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def _score_to_verdict(self, score: float) -> str:
        if score >= 0.80:
            return "phishing"
        elif score >= 0.50:
            return "suspicious"
        else:
            return "legitimate"
