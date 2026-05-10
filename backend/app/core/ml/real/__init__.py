"""
Real ML model implementations for PhishGuard.

Models:
  - BertURLModel: BERT + Structural Features URL phishing classifier
  - RoBERTaModel: RoBERTa email/SMS/voice text phishing classifier
  - DeepfakeVoiceModel: 3-stage hybrid deepfake voice detector
  - WebVisualModel: Playwright-based web visual analysis engine
"""
from app.core.ml.real.url_model import BertURLModel
from app.core.ml.real.nlp_model import RoBERTaModel
from app.core.ml.real.voice_model import DeepfakeVoiceModel
from app.core.ml.real.web_model import WebVisualModel

__all__ = ["BertURLModel", "RoBERTaModel", "DeepfakeVoiceModel", "WebVisualModel"]
