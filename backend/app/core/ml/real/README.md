# Real ML Models — Place Implementations Here

## When your models are ready:

### 1. nlp_model.py
```python
from app.core.ml.base_model import BasePhishModel, ModelOutput

class RoBERTaModel(BasePhishModel):
    async def load(self):
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
        self.tokenizer = AutoTokenizer.from_pretrained(settings.roberta_model_path)
        self.model = AutoModelForSequenceClassification.from_pretrained(settings.roberta_model_path)
        self._loaded = True

    async def predict(self, input_text: str, **kwargs) -> ModelOutput:
        # tokenize → forward pass → softmax → return ModelOutput
        ...
```

### 2. url_model.py — XGBoost + BiLSTM
### 3. web_model.py — pHash + CNN (uses playwright)
### 4. voice_model.py — Whisper STT → NLP

## Then in .env:
```
USE_MOCK_MODELS=false
```

## That's it. No other code changes needed.
