"""
Mock Voice Model — placeholder for Whisper STT → RoBERTa pipeline.
Used during development (USE_MOCK_MODELS=true).

⚠️  MODEL CHANGE POINT — REPLACE WITH:
    app/core/ml/real/voice_model.py
    
    Real implementation should:
    - Accept either:
        (a) audio file path (wav/mp3/ogg) for actual voice calls/recordings
        (b) plain text transcript (for SMS — skip STT step)
    - If audio: run openai-whisper to get transcript
    - Pass transcript to NLPModel.predict() — SAME model, different channel tag
    - features dict should include: {
        "transcript": str,
        "stt_confidence": float,
        "stt_model": str,        e.g. "whisper-base"
        "nlp_features": {...},   same as NLP model output
        "vishing_signals": [...] voice-specific: caller_id_spoofing, robocall_patterns
      }
    
    Install: pip install openai-whisper ffmpeg-python
"""
import logging
from app.core.ml.base_model import BasePhishModel, ModelOutput
from app.core.ml.mock.nlp_mock import MockNLPModel

logger = logging.getLogger(__name__)


class MockVoiceModel(BasePhishModel):
    """Mock voice/SMS model — applies NLP rules to transcript directly."""

    def __init__(self):
        super().__init__()
        self._nlp = MockNLPModel()

    async def load(self) -> None:
        await self._nlp.load()
        logger.info("✅ MockVoiceModel loaded (no STT, passes text to NLP mock)")
        self._loaded = True

    async def predict(self, input_text: str, **kwargs) -> ModelOutput:
        """
        input_text: either a transcript (SMS) or would be audio path (voice).
        Mock treats everything as already-transcribed text.
        """
        nlp_result = await self._nlp.predict(input_text, channel="voice")

        # Add voice-specific vishing signals on top of NLP
        vishing_score_bonus = 0.0
        vishing_signals = []

        text_lower = input_text.lower()
        if "press 1" in text_lower or "press one" in text_lower:
            vishing_score_bonus += 0.2
            vishing_signals.append("ivr_pressure_tactic")
        if "irs" in text_lower or "tax" in text_lower and "arrest" in text_lower:
            vishing_score_bonus += 0.4
            vishing_signals.append("irs_scam_pattern")
        if "gift card" in text_lower and ("pay" in text_lower or "send" in text_lower):
            vishing_score_bonus += 0.45
            vishing_signals.append("gift_card_payment_demand")

        final_score = min(1.0, nlp_result.score + vishing_score_bonus)

        return ModelOutput(
            score=final_score,
            confidence=nlp_result.confidence,
            verdict=self._score_to_verdict(final_score),
            features={
                "transcript": input_text,
                "stt_confidence": None,   # ⚠️ MODEL CHANGE POINT: filled by Whisper
                "stt_model": "none-mock",
                "nlp_features": nlp_result.features,
                "vishing_signals": vishing_signals,
            },
            model_version="mock-voice-v1",
        )
