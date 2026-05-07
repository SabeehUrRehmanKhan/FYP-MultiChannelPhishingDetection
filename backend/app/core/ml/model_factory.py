"""
Model Factory — single entry point for all ML models.
Reads USE_MOCK_MODELS from env and returns appropriate implementation.

⚠️  MODEL CHANGE POINT:
    When real models are ready:
    1. Create app/core/ml/real/nlp_model.py  (subclass BasePhishModel)
    2. Create app/core/ml/real/url_model.py
    3. Create app/core/ml/real/web_model.py
    4. Create app/core/ml/real/voice_model.py
    5. Import them in the `else` block below
    6. Set USE_MOCK_MODELS=false in .env
    
    No other files need to change.
"""
import logging
from functools import lru_cache
from app.core.ml.base_model import BasePhishModel
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# Lazy singletons — models loaded once, reused across requests
_nlp_model: BasePhishModel = None
_url_model: BasePhishModel = None
_web_model: BasePhishModel = None
_voice_model: BasePhishModel = None


async def _get_or_load(instance_var: str, model_class) -> BasePhishModel:
    """Lazily load a model singleton."""
    import sys
    current = globals().get(f"_{instance_var}_model")
    if current is None or not current.is_loaded:
        instance = model_class()
        await instance.load()
        globals()[f"_{instance_var}_model"] = instance
        return instance
    return current


async def get_nlp_model() -> BasePhishModel:
    if settings.use_mock_models:
        from app.core.ml.mock.nlp_mock import MockNLPModel
        return await _get_or_load("nlp", MockNLPModel)
    else:
        # ⚠️  MODEL CHANGE POINT: uncomment when real model is ready
        # from app.core.ml.real.nlp_model import RoBERTaModel
        # return await _get_or_load("nlp", RoBERTaModel)
        raise NotImplementedError("Real NLP model not yet integrated. Set USE_MOCK_MODELS=true")


async def get_url_model() -> BasePhishModel:
    if settings.use_mock_models:
        from app.core.ml.mock.url_mock import MockURLModel
        return await _get_or_load("url", MockURLModel)
    else:
        # ⚠️  MODEL CHANGE POINT: uncomment when real model is ready
        # from app.core.ml.real.url_model import XGBBiLSTMModel
        # return await _get_or_load("url", XGBBiLSTMModel)
        raise NotImplementedError("Real URL model not yet integrated. Set USE_MOCK_MODELS=true")


async def get_web_model() -> BasePhishModel:
    if settings.use_mock_models:
        from app.core.ml.mock.web_mock import MockWebModel
        return await _get_or_load("web", MockWebModel)
    else:
        # ⚠️  MODEL CHANGE POINT: uncomment when real model is ready
        # from app.core.ml.real.web_model import WebVisualModel
        # return await _get_or_load("web", WebVisualModel)
        raise NotImplementedError("Real Web model not yet integrated. Set USE_MOCK_MODELS=true")


async def get_voice_model() -> BasePhishModel:
    if settings.use_mock_models:
        from app.core.ml.mock.voice_mock import MockVoiceModel
        return await _get_or_load("voice", MockVoiceModel)
    else:
        # ⚠️  MODEL CHANGE POINT: uncomment when real model is ready
        # from app.core.ml.real.voice_model import WhisperNLPModel
        # return await _get_or_load("voice", WhisperNLPModel)
        raise NotImplementedError("Real Voice model not yet integrated. Set USE_MOCK_MODELS=true")
