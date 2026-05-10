"""
Real NLP Model — RoBERTa phishing text classifier.
Trained model: ML_DL_Models/Email/
Architecture: RobertaForSequenceClassification (roberta-base fine-tuned)
"""
import os
import json
import logging
import asyncio

import torch
import numpy as np

from app.core.ml.base_model import BasePhishModel, ModelOutput
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

URGENCY_KEYWORDS = {
    "urgent", "immediately", "expire", "expired", "suspend",
    "suspended", "limited time", "act now", "final warning",
    "last chance", "24 hours", "48 hours", "account will be",
}
IMPERSONATION_KEYWORDS = {
    "paypal", "amazon", "microsoft", "apple", "google", "netflix",
    "bank of america", "wells fargo", "chase", "dear customer",
    "dear user", "valued member",
}


class RoBERTaModel(BasePhishModel):
    """Production RoBERTa-based text phishing classifier."""

    def __init__(self):
        super().__init__()
        self.model = None
        self.tokenizer = None
        self.metadata = {}
        self.device = None
        self.threshold = 0.65
        self.max_len = 256

    async def load(self) -> None:
        def _load():
            from transformers import AutoTokenizer, AutoModelForSequenceClassification

            model_dir = settings.roberta_model_path
            logger.info(f"Loading RoBERTa NLP model from {model_dir}")

            meta_path = os.path.join(model_dir, "model_metadata.json")
            if os.path.exists(meta_path):
                with open(meta_path, "r") as f:
                    self.metadata = json.load(f)
                self.threshold = self.metadata.get("threshold", 0.65)
                self.max_len = self.metadata.get("max_len", 256)

            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
            self.model = AutoModelForSequenceClassification.from_pretrained(model_dir, attn_implementation="eager")
            self.model.to(self.device)
            self.model.eval()
            logger.info(f"✅ RoBERTaModel loaded — acc: {self.metadata.get('test_accuracy', 'N/A')}, device: {self.device}")

        await asyncio.get_event_loop().run_in_executor(None, _load)
        self._loaded = True

    async def predict(self, input_text: str, **kwargs) -> ModelOutput:
        channel = kwargs.get("channel", "email")
        text = input_text.strip()

        def _inference():
            encoding = self.tokenizer(
                text, max_length=self.max_len, padding="max_length",
                truncation=True, return_tensors="pt", return_attention_mask=True,
            )
            input_ids = encoding["input_ids"].to(self.device)
            attention_mask = encoding["attention_mask"].to(self.device)

            with torch.no_grad():
                outputs = self.model(
                    input_ids=input_ids, attention_mask=attention_mask,
                    output_attentions=True,
                )
                probs = torch.softmax(outputs.logits, dim=1)
                phishing_prob = probs[0, 1].item()

                # Attention-based explainability: CLS attention to other tokens
                last_attn = outputs.attentions[-1].mean(dim=1).squeeze(0)
                cls_attn = last_attn[0].cpu().numpy()

            tokens = self.tokenizer.convert_ids_to_tokens(input_ids[0].cpu())
            valid = attention_mask[0].cpu().numpy().astype(bool)
            special = {"<s>", "</s>", "<pad>", "[CLS]", "[SEP]", "[PAD]"}

            scored = []
            for i, (tok, v, a) in enumerate(zip(tokens, valid, cls_attn)):
                clean = tok.replace("Ġ", "").replace("▁", "")
                if v and tok not in special and len(clean) > 1:
                    scored.append({"token": clean, "attention": round(float(a), 4), "pos": i})

            scored.sort(key=lambda x: x["attention"], reverse=True)
            return phishing_prob, scored[:10]

        phishing_prob, tokens_flagged = await asyncio.get_event_loop().run_in_executor(None, _inference)

        if phishing_prob >= self.threshold:
            verdict = "phishing"
        elif phishing_prob >= 0.40:
            verdict = "suspicious"
        else:
            verdict = "legitimate"

        text_lower = text.lower()
        urgency_hits = [kw for kw in URGENCY_KEYWORDS if kw in text_lower]
        impersonation_hits = [kw for kw in IMPERSONATION_KEYWORDS if kw in text_lower]

        confidence = abs(phishing_prob - 0.5) * 2
        confidence = max(min(confidence, 1.0), 0.55)

        return ModelOutput(
            score=phishing_prob,
            confidence=confidence,
            verdict=verdict,
            features={
                "channel": channel,
                "text_length": len(text),
                "tokens_flagged": tokens_flagged,
                "phishing_probability": round(phishing_prob, 4),
                "threshold_used": self.threshold,
                "urgency_score": round(min(len(urgency_hits) * 0.2, 1.0), 2),
                "urgency_keywords": urgency_hits[:5],
                "impersonation_score": round(min(len(impersonation_hits) * 0.25, 1.0), 2),
                "impersonation_keywords": impersonation_hits[:5],
                "model_accuracy": self.metadata.get("test_accuracy", 0.9828),
                "model_roc_auc": self.metadata.get("test_roc_auc", 0.9975),
            },
            model_version=f"roberta-{self.metadata.get('version', 'v2')}",
        )
