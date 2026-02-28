"""
Transcription service.

For production you could wrap Whisper tiny or another on-device ASR model.
"""

from pathlib import Path
from typing import Dict


class TranscriptionService:
    def __init__(self):
        # TODO: load Whisper or another transcription model
        self._loaded = True

    def transcribe(self, audio_path: str) -> Dict[str, str]:
        _ = Path(audio_path)
        # Stub transcript
        return {
            "transcript": "This is a placeholder transcript for the candidate's answer."
        }


transcription_service = TranscriptionService()

