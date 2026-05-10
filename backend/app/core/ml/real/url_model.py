"""
Real URL Model — BERT + Structural Features phishing classifier.
Trained model: ML_DL_Models/Url/bert_phishing_best.pt

Architecture (from notebook):
  BERT encoder → [CLS] embedding
  Structural features (8) → scaled
  Concat [CLS] + struct → Linear(768+8, hidden_dim) → ReLU → Dropout → Linear(hidden_dim, 2)

Config loaded from ML_DL_Models/Url/config.json
"""
import os
import re
import json
import math
import logging
import asyncio
from urllib.parse import urlparse, parse_qs

import torch
import torch.nn as nn
import numpy as np
import joblib

from app.core.ml.base_model import BasePhishModel, ModelOutput
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ─────────────────────────────────────────────
# Model Architecture (matches notebook exactly)
# ─────────────────────────────────────────────

class BertURLClassifier(nn.Module):
    """BERT + structural features fusion classifier."""

    def __init__(self, bert_model, n_struct_feats: int = 8, hidden_dim: int = 32, num_classes: int = 2):
        super().__init__()
        self.bert = bert_model
        bert_hidden = self.bert.config.hidden_size  # 768 for bert-base
        self.classifier = nn.Sequential(
            nn.Linear(bert_hidden + n_struct_feats, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim, num_classes),
        )

    def forward(self, input_ids, attention_mask, struct_features):
        outputs = self.bert(input_ids=input_ids, attention_mask=attention_mask)
        cls_embedding = outputs.last_hidden_state[:, 0, :]  # [CLS] token
        combined = torch.cat([cls_embedding, struct_features], dim=1)
        logits = self.classifier(combined)
        return logits


# ─────────────────────────────────────────────
# Feature Extraction
# ─────────────────────────────────────────────

def _url_entropy(text: str) -> float:
    """Shannon entropy of a string."""
    if not text:
        return 0.0
    freq = {}
    for c in text:
        freq[c] = freq.get(c, 0) + 1
    length = len(text)
    return -sum((f / length) * math.log2(f / length) for f in freq.values())


def extract_structural_features(url: str) -> dict:
    """
    Extract the 8 structural features matching config.json struct_cols:
    url_length, domain_length, subdomain_count, path_length,
    query_param_count, special_char_count, has_ip, url_redirects
    """
    try:
        parsed = urlparse(url if url.startswith("http") else f"https://{url}")
        hostname = parsed.hostname or ""
        path = parsed.path or ""

        # Count subdomains (e.g., "sub1.sub2.example.com" → 2)
        parts = hostname.split(".")
        subdomain_count = max(0, len(parts) - 2)

        # Count query parameters
        query_params = parse_qs(parsed.query)
        query_param_count = len(query_params)

        # Special characters in URL
        special_chars = set("@!#$%^&*()+=[]{}|;:',<>?~`")
        special_char_count = sum(1 for c in url if c in special_chars)

        # IP as hostname check
        has_ip = 1 if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", hostname) else 0

        # Redirect indicators (multiple '//' or redirect keywords)
        url_redirects = url.count("//") - 1 + url.lower().count("redirect") + url.lower().count("url=")

        return {
            "url_length": len(url),
            "domain_length": len(hostname),
            "subdomain_count": subdomain_count,
            "path_length": len(path),
            "query_param_count": query_param_count,
            "special_char_count": special_char_count,
            "has_ip": has_ip,
            "url_redirects": min(url_redirects, 10),  # cap at 10
        }
    except Exception as e:
        logger.warning(f"Feature extraction failed for URL: {e}")
        return {
            "url_length": len(url),
            "domain_length": 0,
            "subdomain_count": 0,
            "path_length": 0,
            "query_param_count": 0,
            "special_char_count": 0,
            "has_ip": 0,
            "url_redirects": 0,
        }


# ─────────────────────────────────────────────
# Model Implementation
# ─────────────────────────────────────────────

class BertURLModel(BasePhishModel):
    """Production BERT + Structural Features URL phishing detector."""

    def __init__(self):
        super().__init__()
        self.model = None
        self.tokenizer = None
        self.scaler = None
        self.config = None
        self.device = None
        self.struct_cols = []

    async def load(self) -> None:
        """Load BERT model, tokenizer, scaler, and config from disk."""
        def _load():
            from transformers import BertTokenizer, BertModel, BertConfig

            model_dir = settings.url_model_path
            logger.info(f"Loading BERT URL model from {model_dir}")

            # Load config
            config_path = os.path.join(model_dir, "config.json")
            with open(config_path, "r") as f:
                self.config = json.load(f)

            self.struct_cols = self.config.get("struct_cols", [
                "url_length", "domain_length", "subdomain_count", "path_length",
                "query_param_count", "special_char_count", "has_ip", "url_redirects"
            ])

            # Device selection
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            logger.info(f"Using device: {self.device}")

            # Load tokenizer (BERT-base) - vocab is very small (~1MB)
            self.tokenizer = BertTokenizer.from_pretrained("bert-base-uncased")

            # Load base BERT model architecture WITHOUT downloading 440MB weights
            bert_config = BertConfig.from_pretrained("bert-base-uncased")
            base_bert = BertModel(bert_config)

            # Build classifier
            n_struct = self.config.get("n_struct_feats", 8)
            hidden_dim = self.config.get("hidden_dim", 32)
            self.model = BertURLClassifier(
                bert_model=base_bert,
                n_struct_feats=n_struct,
                hidden_dim=hidden_dim,
                num_classes=2,
            )

            # Load trained weights
            checkpoint_path = os.path.join(model_dir, "bert_phishing_best.pt")
            checkpoint = torch.load(checkpoint_path, map_location=self.device, weights_only=False)

            # Handle different checkpoint formats
            if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
                self.model.load_state_dict(checkpoint["model_state_dict"])
            elif isinstance(checkpoint, dict) and "model_state" in checkpoint:
                self.model.load_state_dict(checkpoint["model_state"])
            else:
                self.model.load_state_dict(checkpoint)

            self.model.to(self.device)
            self.model.eval()

            # Load structural feature scaler
            scaler_path = os.path.join(model_dir, "structural_scaler.pkl")
            if os.path.exists(scaler_path):
                self.scaler = joblib.load(scaler_path)
                logger.info("Structural feature scaler loaded")
            else:
                logger.warning("No scaler found — structural features will be used raw")

            logger.info(
                f"✅ BertURLModel loaded — accuracy: {self.config.get('test_accuracy', 'N/A')}, "
                f"device: {self.device}"
            )

        await asyncio.get_event_loop().run_in_executor(None, _load)
        self._loaded = True

    async def predict(self, input_text: str, **kwargs) -> ModelOutput:
        """Run BERT + structural features inference on a URL."""
        url = input_text.strip()

        def _inference():
            # Extract structural features
            struct_dict = extract_structural_features(url)
            struct_values = [struct_dict[col] for col in self.struct_cols]
            struct_array = np.array([struct_values], dtype=np.float32)

            # Scale structural features
            if self.scaler is not None:
                struct_array = self.scaler.transform(struct_array)

            struct_tensor = torch.tensor(struct_array, dtype=torch.float32).to(self.device)

            # Tokenize URL text
            max_len = self.config.get("max_len", 128)
            encoding = self.tokenizer(
                url,
                max_length=max_len,
                padding="max_length",
                truncation=True,
                return_tensors="pt",
            )
            input_ids = encoding["input_ids"].to(self.device)
            attention_mask = encoding["attention_mask"].to(self.device)

            # Forward pass
            with torch.no_grad():
                logits = self.model(input_ids, attention_mask, struct_tensor)
                probs = torch.softmax(logits, dim=1)
                phishing_prob = probs[0, 1].item()  # class 1 = phishing

            # Parse URL for metadata
            try:
                parsed = urlparse(url if url.startswith("http") else f"https://{url}")
                hostname = parsed.hostname or ""
                tld = "." + hostname.split(".")[-1] if "." in hostname else ""
            except Exception:
                hostname = ""
                tld = ""

            entropy = _url_entropy(hostname)

            return phishing_prob, struct_dict, hostname, tld, entropy

        phishing_prob, struct_dict, hostname, tld, entropy = await asyncio.get_event_loop().run_in_executor(
            None, _inference
        )

        score = phishing_prob
        confidence = abs(score - 0.5) * 2  # Higher when far from 0.5

        return ModelOutput(
            score=score,
            confidence=max(confidence, 0.60),
            verdict=self._score_to_verdict(score),
            features={
                "hostname": hostname,
                "tld": tld,
                "url_length": struct_dict["url_length"],
                "domain_length": struct_dict["domain_length"],
                "subdomain_count": struct_dict["subdomain_count"],
                "path_length": struct_dict["path_length"],
                "query_param_count": struct_dict["query_param_count"],
                "special_char_count": struct_dict["special_char_count"],
                "has_ip": bool(struct_dict["has_ip"]),
                "url_redirects": struct_dict["url_redirects"],
                "entropy": round(entropy, 3),
                "bert_phishing_probability": round(score, 4),
                "model_accuracy": self.config.get("test_accuracy", 0.9554),
                "model_f1": self.config.get("test_f1", 0.9553),
            },
            model_version="bert-url-v1",
        )
