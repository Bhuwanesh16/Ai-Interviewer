"""
Transcription service.

Downloads and runs openai/whisper-tiny as a local on-device ASR model
to keep processing fully edge-based without cloud APIs.
"""

from pathlib import Path
from typing import Dict
import logging

try:
    from transformers import pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    logging.warning("Transformers not installed. Transcription will fallback.")

class TranscriptionService:
    def __init__(self):
        self._loaded = TRANSFORMERS_AVAILABLE
        self.pipe = None
        if TRANSFORMERS_AVAILABLE:
            try:
                logging.info("Loading local whisper-tiny.en model for transcription...")
                self.pipe = pipeline("automatic-speech-recognition", model="openai/whisper-tiny.en", device="cpu")
                logging.info("Whisper model loaded.")
            except Exception as e:
                logging.error(f"Failed to load whisper pipeline: {e}")
                self.pipe = None

    def transcribe(self, audio_path: str) -> Dict[str, str]:
        _ = Path(audio_path)
        
        fallback_text = "Transcription unavailable or audio could not be read. Assuming answer provided."
        
        if not self.pipe:
            return {"transcript": fallback_text}
            
        try:
            # Whisper pipeline directly accepts audio path
            result = self.pipe(audio_path)
            transcript = result.get("text", "").strip()
            
            if not transcript:
                transcript = "(No clear speech detected)"
                
            return {"transcript": transcript}
        except Exception as e:
            logging.error(f"Speech-to-text transcription error: {e}")
            return {"transcript": "(Speech parsing error - File may be missing FFmpeg encoders)"}


transcription_service = TranscriptionService()
