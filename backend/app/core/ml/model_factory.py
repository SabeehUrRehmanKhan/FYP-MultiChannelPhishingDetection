"""
Model Factory — single entry point for all ML models.
Reads USE_MOCK_MODELS from env and returns appropriate implementation.
"""
import logging
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
        from app.core.ml.real.nlp_model import RoBERTaModel
        return await _get_or_load("nlp", RoBERTaModel)


async def get_url_model() -> BasePhishModel:
    if settings.use_mock_models:
        from app.core.ml.mock.url_mock import MockURLModel
        return await _get_or_load("url", MockURLModel)
    else:
        from app.core.ml.real.url_model import BertURLModel
        return await _get_or_load("url", BertURLModel)


async def get_web_model() -> BasePhishModel:
    if settings.use_mock_models:
        from app.core.ml.mock.web_mock import MockWebModel
        return await _get_or_load("web", MockWebModel)
    else:
        from app.core.ml.real.web_model import WebVisualModel
        return await _get_or_load("web", WebVisualModel)


async def get_voice_model() -> BasePhishModel:
    if settings.use_mock_models:
        from app.core.ml.mock.voice_mock import MockVoiceModel
        return await _get_or_load("voice", MockVoiceModel)
    else:
        from app.core.ml.real.voice_model import DeepfakeVoiceModel
        return await _get_or_load("voice", DeepfakeVoiceModel)
