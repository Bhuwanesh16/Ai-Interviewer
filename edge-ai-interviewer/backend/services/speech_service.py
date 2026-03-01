"""
Speech analysis service.

This uses librosa to extract acoustic features (such as speaking rate, 
pauses, and pitch variations) from the audio file to compute a heuristic 
speech quality/confidence score.
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

    def analyze_audio(self, audio_path: str) -> Dict[str, float]:
        _ = Path(audio_path)
        
        if not LIBROSA_AVAILABLE:
            return {"speech_score": 0.83}
            
        try:
            # Load the audio file
            y, sr = librosa.load(audio_path, sr=None)
            
            # If the audio is extremely short or empty, return a low score
            if len(y) == 0:
                return {"speech_score": 0.0}
            
            # 1. Speaking Rate Heuristic (using onset detection)
            # Detecting note onsets to estimate syllables/words per second
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
            duration_sec = librosa.get_duration(y=y, sr=sr)
            
            if duration_sec == 0:
                return {"speech_score": 0.0}
                
            rate_per_sec = len(onsets) / duration_sec
            
            # A good speaking pace is typically bounded; too slow or too fast gets penalized.
            # Let's target around 2-4 onsets per second.
            rate_score = 1.0 - min(abs(rate_per_sec - 3.0) / 3.0, 1.0)
            
            # 2. Energy / Loudness variation (Pitch/Energy stability)
            # Compute RMS energy
            rms = librosa.feature.rms(y=y)[0]
            mean_rms = np.mean(rms)
            std_rms = np.std(rms)
            
            # Calculate coefficient of variation for energy
            # Some variation is good (expressive), too much or too little is bad
            cv_rms = std_rms / (mean_rms + 1e-6)
            energy_score = 1.0 - min(abs(cv_rms - 0.7) / 0.7, 1.0)
            
            # 3. Pause detection (rough heuristic)
            # Find segments where energy is below a threshold
            threshold = mean_rms * 0.2
            silent_frames = np.sum(rms < threshold)
            total_frames = len(rms)
            silence_ratio = silent_frames / total_frames
            
            # Too much silence (hesitation) or no pauses (rushed)
            pause_score = 1.0 - min(abs(silence_ratio - 0.15) / 0.15, 1.0)
            
            # Combine the heuristic metrics into a final speech score
            # Weights: Rate 40%, Consistency (Energy) 30%, Pause/Hesitation 30%
            final_score = (rate_score * 0.4) + (energy_score * 0.3) + (pause_score * 0.3)
            
            # Clamp the score between 0.1 and 1.0
            final_score = max(0.1, min(final_score, 1.0))
            
            # Smooth out the score slightly (bump up naturally to avoid harsh grading for basic inputs)
            final_score = final_score * 0.5 + 0.4
            
            return {"speech_score": round(float(final_score), 2)}
            
        except Exception as e:
            logging.error(f"Error during speech analysis: {e}")
            # Fallback
            return {"speech_score": 0.83}


speech_service = SpeechAnalysisService()

