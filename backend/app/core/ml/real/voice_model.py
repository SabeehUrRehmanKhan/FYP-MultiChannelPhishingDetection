"""
Real Voice Model — 3-Stage Hybrid Deepfake Voice Detector.
Adapted from ML_DL_Models/DeepFake Voice Detection/predict_deepfake.py

Pipeline: Audio → Acoustic Rules → Prosody NN → Neural AST (Sliding Window)
Weights: 0.20 acoustic + 0.35 prosody + 0.45 neural

For text-only input (SMS): delegates to NLP model.
For audio files: runs full 3-stage deepfake detection pipeline.
"""
import os
import tempfile
import logging
import asyncio

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchaudio
import numpy as np
import librosa
import joblib

from app.core.ml.base_model import BasePhishModel, ModelOutput
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ─────────────────────────────────────────────
# Neural Network Architectures (from notebook)
# ─────────────────────────────────────────────

class ChannelAttention(nn.Module):
    def __init__(self, in_planes, ratio=16):
        super().__init__()
        self.avg_pool = nn.AdaptiveAvgPool2d(1)
        self.max_pool = nn.AdaptiveMaxPool2d(1)
        self.fc1 = nn.Conv2d(in_planes, in_planes // ratio, 1, bias=False)
        self.relu = nn.ReLU()
        self.fc2 = nn.Conv2d(in_planes // ratio, in_planes, 1, bias=False)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        avg = self.fc2(self.relu(self.fc1(self.avg_pool(x))))
        mx = self.fc2(self.relu(self.fc1(self.max_pool(x))))
        return self.sigmoid(avg + mx)


class SpatialAttention(nn.Module):
    def __init__(self, kernel_size=7):
        super().__init__()
        self.conv = nn.Conv2d(2, 1, kernel_size, padding=kernel_size // 2, bias=False)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        avg = torch.mean(x, dim=1, keepdim=True)
        mx, _ = torch.max(x, dim=1, keepdim=True)
        return self.sigmoid(self.conv(torch.cat([avg, mx], dim=1)))


class HybridAST(nn.Module):
    def __init__(self, n_mels=128, num_heads=4, hidden_dim=256, num_layers=2):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32), nn.ReLU(), nn.MaxPool2d(2)
        )
        self.ca = ChannelAttention(32)
        self.sa = SpatialAttention()
        self.feature_dim = 32 * (n_mels // 2)
        self.linear_proj = nn.Linear(self.feature_dim, hidden_dim)
        encoder_layer = nn.TransformerEncoderLayer(d_model=hidden_dim, nhead=num_heads, batch_first=True)
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.classifier = nn.Sequential(
            nn.Linear(hidden_dim, 64), nn.ReLU(), nn.Dropout(0.3), nn.Linear(64, 1)
        )

    def forward(self, x):
        x = self.conv(x)
        x = x * self.ca(x)
        x = x * self.sa(x)
        B, C, H, W = x.shape
        x = x.permute(0, 3, 1, 2).contiguous().view(B, W, C * H)
        x = self.linear_proj(x)
        x = self.transformer(x)
        return self.classifier(x.mean(dim=1)).squeeze(1)


class HighProsodyClassifier(nn.Module):
    def __init__(self, input_dim=18, dropout=0.3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 32), nn.BatchNorm1d(32), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(32, 16), nn.BatchNorm1d(16), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(16, 1), nn.Sigmoid()
        )

    def forward(self, x):
        return self.net(x).squeeze(1)


# ─────────────────────────────────────────────
# Feature Extractors (from predict_deepfake.py)
# ─────────────────────────────────────────────

class ProsodyExtractor:
    """Extracts 18 prosody features: pitch(4) + tremor(3) + spectral(4) + energy(4) + temporal(3)."""
    def __init__(self, sr=16000):
        self.sr = sr

    def extract_all(self, y):
        feats = []
        feats.extend(self._pitch(y))
        feats.extend(self._tremor(y))
        feats.extend(self._spectral(y))
        feats.extend(self._energy(y))
        feats.extend(self._temporal(y))
        return np.array(feats, dtype=np.float32)

    def _pitch(self, y):
        try:
            f0, voiced, _ = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'), sr=self.sr)
            f0_v = f0[~np.isnan(f0)]
            if len(f0_v) < 20: return [0.5] * 4
            pr = float((np.percentile(f0_v, 95) - np.percentile(f0_v, 5)) / (np.mean(f0_v) + 1e-6))
            d2 = np.diff(f0_v, n=2)
            ps = float(1.0 / (np.std(d2) + 1e-6) / 100.0)
            vr = float(np.sum(voiced) / len(voiced))
            h, _ = np.histogram(f0_v, bins=20)
            h = h / (h.sum() + 1e-10)
            pe = 1.0 - np.clip(float(-np.sum(h * np.log(h + 1e-10))) / np.log(20), 0, 1)
            return [np.clip(1.0 - pr, 0, 1), np.clip(ps, 0, 1), vr, float(pe)]
        except Exception:
            return [0.5] * 4

    def _tremor(self, y):
        try:
            rms = librosa.feature.rms(y=y, frame_length=int(0.025 * self.sr), hop_length=int(0.005 * self.sr))[0]
            efft = np.abs(np.fft.rfft(rms))
            freqs = np.fft.rfftfreq(len(rms), d=int(0.005 * self.sr) / self.sr)
            mask = (freqs >= 4) & (freqs <= 12)
            tr = float(np.sum(efft[mask]) / (np.sum(efft) + 1e-10))
            ts = 1.0 - np.clip(tr * 20, 0, 1)
            jt = float(np.std(np.diff(rms)) / (np.mean(rms) + 1e-6)) if len(rms) > 10 else 0.1
            js = 1.0 - np.clip(jt * 5, 0, 1)
            rn = rms / (np.mean(rms) + 1e-6)
            ss = 1.0 - np.clip(float(np.std(rn)), 0, 1)
            return [ts, js, ss]
        except Exception:
            return [0.5] * 3

    def _spectral(self, y):
        try:
            hop = int(0.010 * self.sr)
            stft = np.abs(librosa.stft(y, n_fft=1024, hop_length=hop))
            fl = librosa.feature.spectral_flatness(S=stft)[0]
            fs = 1.0 - np.clip(float(np.std(fl) / (np.mean(fl) + 1e-6)), 0, 1)
            ro = librosa.feature.spectral_rolloff(S=stft, sr=self.sr)[0]
            rs = 1.0 - np.clip(float(np.std(ro) / (np.mean(ro) + 1e-6)), 0, 1)
            freqs = librosa.fft_frequencies(sr=self.sr, n_fft=1024)
            hf = float(np.mean(stft[freqs > 4000]) / (np.mean(stft) + 1e-10))
            gm = (freqs >= 2000) & (freqs <= 4000)
            gs = 1.0 - np.clip(float(np.mean(stft[gm]) / (np.mean(stft) + 1e-10)) * 5, 0, 1)
            return [fs, rs, np.clip(hf, 0, 1), gs]
        except Exception:
            return [0.5] * 4

    def _energy(self, y):
        try:
            fl = int(0.025 * self.sr)
            hop = int(0.010 * self.sr)
            rms = librosa.feature.rms(y=y, frame_length=fl, hop_length=hop)[0]
            x = np.arange(len(rms))
            c = np.polyfit(x, rms, deg=3)
            fitted = np.polyval(c, x)
            sm = float(1.0 - np.clip(np.std(rms - fitted) / (np.mean(rms) + 1e-6), 0, 1))
            dr = float(np.percentile(rms, 95) / (np.percentile(rms, 5) + 1e-10))
            ds = 1.0 - np.clip((dr - 1) / 20, 0, 1)
            zcr = librosa.feature.zero_crossing_rate(y, frame_length=fl, hop_length=hop)[0]
            zs = 1.0 - np.clip(float(np.std(zcr) / (np.mean(zcr) + 1e-6)), 0, 1)
            sr_val = float(np.mean(rms < (0.01 * np.mean(rms))))
            return [sm, ds, zs, sr_val]
        except Exception:
            return [0.5] * 4

    def _temporal(self, y):
        try:
            fl = int(0.050 * self.sr)
            hop = int(0.025 * self.sr)
            rms = librosa.feature.rms(y=y, frame_length=fl, hop_length=hop)[0]
            thresh = 0.15 * np.mean(rms)
            is_low = rms < thresh
            starts = np.where(np.diff(is_low.astype(int)) == 1)[0]
            reg = 0.5
            if len(starts) >= 3:
                ivs = np.diff(starts)
                reg = float(1.0 - np.clip(np.std(ivs) / (np.mean(ivs) + 1e-6), 0, 1))
            oe = librosa.onset.onset_strength(y=y, sr=self.sr)
            rc = 1.0 - np.clip(np.std(oe) / (np.mean(oe) + 1e-6) / 2, 0, 1) if len(oe) > 10 else 0.5
            pauses = []
            in_p, pl = False, 0
            for r in rms:
                if r < thresh:
                    in_p = True; pl += 1
                elif in_p:
                    pauses.append(pl); in_p = False; pl = 0
            pc = float(1.0 - np.clip(np.std(pauses) / (np.mean(pauses) + 1e-6), 0, 1)) if len(pauses) >= 3 else 0.5
            return [reg, rc, pc]
        except Exception:
            return [0.5] * 3


class AcousticAnalyzer:
    """Rule-based acoustic clarity analysis."""
    def __init__(self, sr=16000):
        self.sr = sr

    def analyze(self, y):
        try:
            rms = librosa.feature.rms(y=y, frame_length=int(0.025 * self.sr), hop_length=int(0.010 * self.sr))[0]
            sorted_rms = np.sort(rms)
            noise = np.mean(sorted_rms[:max(1, len(sorted_rms) // 10)]) + 1e-10
            signal = np.mean(sorted_rms[-max(1, len(sorted_rms) // 10):])
            snr = 20 * np.log10(signal / noise)

            silence = float(np.mean(rms < (0.01 * np.mean(rms))))

            f0, voiced, _ = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'), sr=self.sr)
            voiced_f0 = f0[voiced & ~np.isnan(f0)]
            pitch_var = float(np.std(voiced_f0)) if len(voiced_f0) >= 10 else 999.0

            rules, conf = [], 0.0
            if snr > 50: rules.append(f"SNR={snr:.1f}dB"); conf += 0.3
            if silence > 0.85: rules.append(f"Silence={silence:.1%}"); conf += 0.2
            if pitch_var < 2.0: rules.append(f"PitchVar={pitch_var:.1f}Hz"); conf += 0.2

            return {"flagged": len(rules) >= 2, "confidence": min(conf, 1.0), "rules": rules}
        except Exception:
            return {"flagged": False, "confidence": 0.0, "rules": []}


# ─────────────────────────────────────────────
# Model Implementation
# ─────────────────────────────────────────────

class DeepfakeVoiceModel(BasePhishModel):
    """Production 3-stage hybrid deepfake voice detector."""

    def __init__(self):
        super().__init__()
        self.hybrid_model = None
        self.prosody_model = None
        self.prosody_scaler = None
        self.prosody_extractor = ProsodyExtractor()
        self.acoustic_analyzer = AcousticAnalyzer()
        self.device = None
        self.mel_transform = None
        self.to_db = None
        self._nlp_model = None  # Fallback for text-only input

    async def load(self) -> None:
        def _load():
            model_dir = settings.voice_model_path
            logger.info(f"Loading Deepfake Voice models from {model_dir}")

            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

            # Load HybridAST
            ast_path = os.path.join(model_dir, "HybridAST.pth")
            ast_ckpt = torch.load(ast_path, map_location=self.device, weights_only=False)
            params = ast_ckpt.get("best_params", {"num_heads": 8, "hidden_dim": 256})
            self.hybrid_model = HybridAST(num_heads=params["num_heads"], hidden_dim=params["hidden_dim"]).to(self.device)
            self.hybrid_model.load_state_dict(ast_ckpt["model_state"])
            self.hybrid_model.eval()

            # Load Prosody classifier
            prosody_path = os.path.join(model_dir, "prosody_classifier.pth")
            self.prosody_model = HighProsodyClassifier(input_dim=18).to(self.device)
            self.prosody_model.load_state_dict(torch.load(prosody_path, map_location=self.device))
            self.prosody_model.eval()

            scaler_path = os.path.join(model_dir, "prosody_scaler.pkl")
            self.prosody_scaler = joblib.load(scaler_path)

            # Audio transforms
            self.mel_transform = torchaudio.transforms.MelSpectrogram(
                sample_rate=16000, n_fft=1024, hop_length=512, n_mels=128
            ).to(self.device)
            self.to_db = torchaudio.transforms.AmplitudeToDB().to(self.device)

            logger.info(f"✅ DeepfakeVoiceModel loaded — 3-stage pipeline, device: {self.device}")

        await asyncio.get_event_loop().run_in_executor(None, _load)
        self._loaded = True

    async def predict(self, input_text: str, **kwargs) -> ModelOutput:
        channel = kwargs.get("channel", "voice")
        file_content = kwargs.get("file_content")

        # Text-only path (SMS/transcript) → delegate to NLP
        if not file_content:
            return await self._predict_text(input_text, channel)

        # Audio path → full 3-stage deepfake detection
        return await self._predict_audio(file_content, channel)

    async def _predict_text(self, text: str, channel: str) -> ModelOutput:
        """For SMS/text: use NLP model as fallback."""
        if self._nlp_model is None:
            from app.core.ml.model_factory import get_nlp_model
            self._nlp_model = await get_nlp_model()

        nlp_result = await self._nlp_model.predict(text, channel=channel)

        # Add vishing signals on top
        text_lower = text.lower()
        vishing_bonus = 0.0
        vishing_signals = []
        if "press 1" in text_lower or "press one" in text_lower:
            vishing_bonus += 0.2; vishing_signals.append("ivr_pressure")
        if "irs" in text_lower or ("tax" in text_lower and "arrest" in text_lower):
            vishing_bonus += 0.4; vishing_signals.append("irs_scam")
        if "gift card" in text_lower and ("pay" in text_lower or "send" in text_lower):
            vishing_bonus += 0.45; vishing_signals.append("gift_card_demand")

        final = min(1.0, nlp_result.score + vishing_bonus)
        return ModelOutput(
            score=final, confidence=nlp_result.confidence,
            verdict=self._score_to_verdict(final),
            features={
                "analysis_type": "text_only",
                "transcript": text[:500],
                "nlp_features": nlp_result.features,
                "vishing_signals": vishing_signals,
            },
            model_version="voice-text-v2",
        )

    async def _predict_audio(self, file_content: bytes, channel: str) -> ModelOutput:
        """Full 3-stage deepfake detection on audio bytes."""
        def _inference():
            # Save to temp file for librosa
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(file_content)
                tmp_path = tmp.name

            try:
                y, sr = librosa.load(tmp_path, sr=16000, mono=True)
                duration = len(y) / sr

                # Stage 1: Acoustic rules
                acoustic = self.acoustic_analyzer.analyze(y)

                # Stage 2: Prosody NN
                feats = self.prosody_extractor.extract_all(y)
                feats_s = self.prosody_scaler.transform(feats.reshape(1, -1))
                feats_t = torch.tensor(feats_s, dtype=torch.float32).to(self.device)
                with torch.no_grad():
                    prosody_prob = self.prosody_model(feats_t).item()

                # Stage 3: Neural AST
                waveform = torch.from_numpy(y).unsqueeze(0).to(self.device)
                log_mel = self.to_db(self.mel_transform(waveform))
                if log_mel.shape[2] > 130:
                    log_mel = log_mel[:, :, :130]
                else:
                    log_mel = F.pad(log_mel, (0, 130 - log_mel.shape[2]))
                input_tensor = log_mel.unsqueeze(0)

                with torch.no_grad():
                    neural_logit = self.hybrid_model(input_tensor)
                    neural_prob = torch.sigmoid(neural_logit).item()

                # Weighted combination
                w_a, w_p, w_n = 0.20, 0.35, 0.45
                final_score = w_a * acoustic["confidence"] + w_p * prosody_prob + w_n * neural_prob

                # Neural conflict override
                if (acoustic["confidence"] > 0.7 or prosody_prob > 0.7) and neural_prob < 0.1:
                    final_score = max(final_score, 0.7)

                # Multi-flag boost
                flags = sum([acoustic["flagged"], prosody_prob > 0.6, neural_prob > 0.10])
                if flags == 2: final_score = min(final_score * 1.15, 1.0)
                elif flags >= 3: final_score = min(final_score * 1.25, 1.0)

                is_fake = final_score > 0.10
                confidence = final_score if is_fake else 1 - final_score

                return {
                    "final_score": final_score,
                    "is_fake": is_fake,
                    "confidence": confidence,
                    "duration": duration,
                    "acoustic_score": acoustic["confidence"],
                    "acoustic_rules": acoustic["rules"],
                    "prosody_score": prosody_prob,
                    "neural_score": neural_prob,
                    "prosody_features_raw": feats.tolist(),
                }
            finally:
                os.unlink(tmp_path)

        result = await asyncio.get_event_loop().run_in_executor(None, _inference)

        verdict_str = "phishing" if result["is_fake"] else "legitimate"

        return ModelOutput(
            score=result["final_score"],
            confidence=result["confidence"],
            verdict=verdict_str,
            features={
                "analysis_type": "deepfake_audio",
                "verdict_label": "FAKE" if result["is_fake"] else "REAL",
                "duration_sec": round(result["duration"], 1),
                "scores": {
                    "acoustic_clarity": round(result["acoustic_score"], 4),
                    "prosody_analysis": round(result["prosody_score"], 4),
                    "neural_transformer": round(result["neural_score"], 4),
                },
                "weights": {"acoustic": 0.20, "prosody": 0.35, "neural": 0.45},
                "acoustic_rules_hit": result["acoustic_rules"],
                "prosody_feature_vector": result["prosody_features_raw"],
            },
            model_version="deepfake-hybrid-v2",
        )
