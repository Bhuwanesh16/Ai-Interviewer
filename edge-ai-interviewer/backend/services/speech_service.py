"""
Speech analysis service.

Uses librosa to extract acoustic features (such as speaking rate,
pauses, and pitch variations) from the audio file to compute a heuristic
speech quality/confidence score.

Fixes applied:
- energy_score formula corrected: now rewards lower coefficient of variation
  (stable volume) instead of rewarding a CV of exactly 0.7 (high variance).
  Old: 1.0 - min(abs(cv_rms - 0.7) / 0.7, 1.0)  ← rewards CV=0.7 (wrong)
  New: 1.0 - min(cv_rms / 1.5, 1.0)              ← lower variance = better
"""

from pathlib import Path
from typing import Dict
import logging

try:
    import librosa
    import numpy as np
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    logging.warning("librosa is not installed. Speech analysis will fall back to a placeholder score.")


class SpeechAnalysisService:
    def __init__(self):
        self._loaded = LIBROSA_AVAILABLE

    def analyze_audio(self, audio_path: str, duration_override: float = None) -> Dict[str, any]:
        _ = Path(audio_path)

        if not LIBROSA_AVAILABLE:
            # Neutral fallback — 0.5 is honest "we don't know" rather than 0.83 bias
            return {"speech_score": 0.5, "metrics": {"clarity": "Unavailable", "pace": "Unknown"}}

        try:
            # Load the audio file
            # Performance: only analyze the first 30 seconds.
            y, sr = librosa.load(audio_path, sr=None, duration=30)

            # If the audio is extremely short or empty, return a low score
            if len(y) == 0:
                return {"speech_score": 0.0, "metrics": {"clarity": "No Signal"}}

            # 1. Speaking Rate Heuristic (using onset detection)
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
            # Prefer a provided duration (e.g. from ASR) which reflects
            # actual spoken content; fall back to file duration otherwise.
            if duration_override is not None and duration_override > 0:
                duration_sec = float(duration_override)
            else:
                duration_sec = librosa.get_duration(y=y, sr=sr)

            if duration_sec == 0:
                return {"speech_score": 0.0, "metrics": {}}

            rate_per_sec = len(onsets) / duration_sec
            # Target: 2.0–3.5 onsets/sec is typical for clear, measured speech
            # Use a Gaussian-like bell curve centred at 2.75 (midpoint of ideal range)
            # so both very fast and very slow speakers score poorly
            target_rate = 2.75
            rate_deviation = abs(rate_per_sec - target_rate)
            rate_score = max(0.0, 1.0 - (rate_deviation / 2.5) ** 1.5)

            # 2. Clarity & SNR (calibrated for compressed WebM audio)
            rms = librosa.feature.rms(y=y)[0]
            sorted_rms = np.sort(rms)
            # Use median of bottom 20% for noise floor — more robust than mean of 10%
            noise_floor = np.median(sorted_rms[:max(1, int(len(sorted_rms) * 0.20))])
            peak_signal = np.percentile(rms, 90)   # 90th pct, not absolute max (avoids clipping spikes)

            # SNR in dB approximation.
            # WebM/Opus compressed audio typically has SNR 10–20 dB even for good speech.
            # Recalibrated range: >15 dB = good, 5–15 = acceptable, <5 = poor
            snr = 20 * np.log10(peak_signal / (noise_floor + 1e-6)) if peak_signal > 0 else 0
            # Old: (snr-5)/25 — too generous for compressed audio (scores near 1.0 always)
            # New: (snr-3)/20 — gives meaningful spread across real compressed audio
            clarity_score = min(max((snr - 3) / 20.0, 0.0), 1.0)

            # 3. Prosody / Monotony (Frequency Variation)
            f0, _, _ = librosa.pyin(
                y,
                fmin=librosa.note_to_hz('C2'),
                fmax=librosa.note_to_hz('C7'),
                sr=sr,
                fill_na=0.0
            )
            f0_nonzero = f0[f0 > 0]
            if len(f0_nonzero) > 5:
                pitch_std = np.std(f0_nonzero)
                # Pitch variation helps convey interest; std < 10 is very monotone.
                pitch_score = min(pitch_std / 40.0, 1.0)
            else:
                pitch_score = 0.5  # Default for very short clips

            # 4. Energy Stability
            mean_rms = np.mean(rms)
            std_rms = np.std(rms)
            cv_rms = std_rms / (mean_rms + 1e-6)

            # FIX: Old formula `1.0 - min(abs(cv_rms - 0.7) / 0.7, 1.0)` rewarded
            # a coefficient of variation of exactly 0.7 (high variance), treating
            # both CV=0.1 (stable) and CV=1.5 (very unstable) as equally bad.
            # Professional speech should be rewarded for LOWER variance.
            # New formula: linear decay — CV=0 → 1.0, CV=1.5 → 0.0
            energy_score = 1.0 - min(cv_rms / 1.5, 1.0)

            # Final Blend (Pace 25%, Clarity 30%, Prosody 25%, Energy Stability 20%)
            # Clarity raised from 25% — it's the most objective signal
            final_score = (
                (rate_score    * 0.25) +
                (clarity_score * 0.30) +
                (pitch_score   * 0.25) +
                (energy_score  * 0.20)
            )
            final_score = max(0.05, min(final_score, 1.0))

            # Professional classification
            is_energetic = mean_rms > 0.05   # RMS energy threshold for "loud enough"
            is_stable = cv_rms < 0.8

            state = (
                "Confident" if (pitch_score > 0.4 and is_stable and is_energetic)
                else "Nervous" if (cv_rms > 1.2 or pitch_score < 0.2)
                else "Steady"
            )

            return {
                "speech_score": round(float(final_score), 2),
                "rate_per_sec": round(rate_per_sec, 2),
                "snr_db": round(float(snr), 1),
                "pitch_variance": round(pitch_score, 2),
                "metrics": {
                    "clarity": "Excellent" if snr > 25 else "Professional" if snr > 18 else "Check Mic",
                    "pace": "Fluid" if 2.2 <= rate_per_sec <= 3.8 else "Fast" if rate_per_sec > 3.8 else "Slow",
                    "prosody": "Engaging" if pitch_score > 0.6 else "Balanced" if pitch_score > 0.3 else "Monotone",
                    "confidence": state,
                    "volume_stability": "Consistent" if cv_rms < 0.6 else "Moderate" if cv_rms < 1.0 else "Fluctuating"
                }
            }

        except Exception as e:
            logging.error(f"Error during speech analysis: {e}")
            # Return 0.5 (neutral) instead of 0.83 (falsely high)
            return {"speech_score": 0.5, "metrics": {"clarity": "Error", "pace": "Unknown"}}


speech_service = SpeechAnalysisService()