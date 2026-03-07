"""
Transcription service — robust on-device ASR with online fallback.

Loading / execution priority:
  1. openai-whisper  (pure PyTorch, most reliable on Windows)
  2. faster-whisper  (optimized, needs ctranslate2 / VC++ runtime)
  3. transformers pipeline (heavy, last local resort)
  4. SpeechRecognition via Google (online fallback — requires internet)

Audio preprocessing:
  • ffmpeg is used to convert WebM/Opus blobs → 16 kHz mono WAV.
  • librosa is used as a fallback audio loader if ffmpeg is missing.
"""

from pathlib import Path
from typing import Dict
import logging
import os
import subprocess
import shutil

# ── import optional deps ───────────────────────────────────────────────────────

# ── Global indicators (evaluated lazily in the class) ───────────────────────────
SR_AVAILABLE = False
try:
    import speech_recognition as sr_lib
    SR_AVAILABLE = True
except ImportError:
    pass

LIBROSA_AVAILABLE = False
try:
    import librosa
    LIBROSA_AVAILABLE = True
except ImportError:
    pass

# ── helpers ────────────────────────────────────────────────────────────────────

def _ffmpeg_ok() -> bool:
    try:
        subprocess.run(["ffmpeg", "-version"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return True
    except Exception:
        return False


def _ffmpeg_path() -> str | None:
    try:
        return shutil.which("ffmpeg")
    except Exception:
        return None


def _to_wav_with_ffmpeg(src_path: str, wav_path: str) -> bool:
    cmd = [
        "ffmpeg", "-y", "-i", src_path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-f", "wav",
        wav_path,
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, text=True)
        if proc.returncode != 0:
            logging.warning(f"ffmpeg conversion failed (code={proc.returncode}): {proc.stderr[-400:]}")
            return False
        return Path(wav_path).exists() and Path(wav_path).stat().st_size > 0
    except Exception as exc:
        logging.warning(f"ffmpeg conversion failed: {exc}")
        return False


def _to_wav(audio_path: str) -> str:
    """Convert any audio to 16 kHz mono WAV. Returns converted path or original."""
    ext = os.path.splitext(audio_path)[1].lower()
    if ext == ".wav":
        return audio_path

    wav_path = audio_path + "_c.wav"

    # Try FFmpeg first
    if _ffmpeg_ok():
        if _to_wav_with_ffmpeg(audio_path, wav_path):
            return wav_path

    # Fallback: Librosa + SoundFile
    if LIBROSA_AVAILABLE:
        try:
            import soundfile as sf
            import librosa
            logging.info(f"FFmpeg failed/missing. Trying librosa to convert {ext}...")
            # Note: librosa.load might still need ffmpeg for some formats,
            # but soundfile handles many common ones directly.
            y, sr = librosa.load(audio_path, sr=16000, mono=True)
            sf.write(wav_path, y, 16000)
            logging.info("Conversion via librosa successful ✓")
            return wav_path
        except Exception as exc:
            logging.warning(f"librosa conversion failed: {exc}")

    return audio_path

# ── service ────────────────────────────────────────────────────────────────────

class TranscriptionService:

    def __init__(self):
        self._whisper   = None
        self._fw_model  = None
        self._hf_pipe   = None
        self._load_error = None
        self._ffmpeg = _ffmpeg_ok()

    def _ensure_whisper(self):
        """Lazy-load openai-whisper."""
        if self._whisper:
            return True
        try:
            import whisper
            logging.info("Loading openai-whisper tiny.en …")
            # This is the line that might hang if it needs to download
            self._whisper = whisper.load_model("tiny.en")
            logging.info("openai-whisper ready ✓")
            return True
        except ImportError:
            self._load_error = "openai-whisper not installed."
            return False
        except Exception as exc:
            self._load_error = f"openai-whisper load error: {exc}"
            logging.warning(self._load_error)
            return False

    def _ensure_transformers(self):
        """Lazy-load transformers pipeline."""
        if self._hf_pipe:
            return True
        try:
            from transformers import pipeline as hf_pipeline
            logging.info("Loading HF whisper-tiny.en …")
            self._hf_pipe = hf_pipeline(
                "automatic-speech-recognition",
                model="openai/whisper-tiny.en",
                device=-1)
            logging.info("HF pipeline ready ✓")
            return True
        except Exception as exc:
            logging.warning(f"HF pipeline load error: {exc}")
            return False

    def _ensure_faster_whisper(self):
        if self._fw_model:
            return True
        try:
            from faster_whisper import WhisperModel
            self._fw_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
            return True
        except Exception as exc:
            logging.warning(f"faster-whisper load error: {exc}")
            return False

    def status(self) -> Dict[str, object]:
        # Attempt loads so status reflects reality
        self._ensure_whisper()
        if not self._whisper:
            self._ensure_faster_whisper()

        return {
            "ffmpeg": bool(self._ffmpeg),
            "ffmpeg_path": _ffmpeg_path(),
            "whisper_loaded": bool(self._whisper),
            "faster_whisper_loaded": bool(self._fw_model),
            "transformers_loaded": bool(self._hf_pipe),
            "speech_recognition_available": bool(SR_AVAILABLE),
            "librosa_available": bool(LIBROSA_AVAILABLE),
            "pydub_available": self._pydub_ok(),
            "load_error": self._load_error,
        }

    def _pydub_ok(self) -> bool:
        try:
            import pydub
            return True
        except ImportError:
            return False

    # ──────────────────────────────────────────────────────────────────────────

    def transcribe(self, audio_path: str) -> Dict[str, str]:
        self._ensure_whisper()
        p = Path(audio_path)
        if not p.exists():
            return {"transcript": "(Audio file missing — check upload)"}

        # Convert to WAV for maximum compatibility
        wav_path = _to_wav(audio_path)

        # If conversion failed and we still have a video container, try extracting audio explicitly
        if wav_path == audio_path and os.path.splitext(audio_path)[1].lower() in {".webm", ".mp4", ".mkv", ".mov"}:
            forced_wav = audio_path + "_x.wav"
            if _ffmpeg_ok() and _to_wav_with_ffmpeg(audio_path, forced_wav):
                wav_path = forced_wav

        # 1. openai-whisper ────────────────────────────────────────────────────
        if self._whisper:
            try:
                result = self._whisper.transcribe(wav_path, language="en", fp16=False)
                txt = result.get("text", "").strip()
                if txt:
                    logging.info(f"openai-whisper transcribed {len(txt.split())} words.")
                    return {"transcript": txt}
            except Exception as exc:
                logging.error(f"openai-whisper inference error: {exc}")

        # 2. faster-whisper ───────────────────────────────────────────────────
        if self._fw_model:
            try:
                segs, _ = self._fw_model.transcribe(wav_path, beam_size=5)
                txt = " ".join(s.text for s in segs).strip()
                if txt:
                    return {"transcript": txt}
            except Exception as exc:
                logging.error(f"faster-whisper inference error: {exc}")

        # 3. transformers ─────────────────────────────────────────────────────
        if self._hf_pipe:
            try:
                out = self._hf_pipe(wav_path)
                txt = out.get("text", "").strip()
                if txt:
                    return {"transcript": txt}
            except Exception as exc:
                logging.error(f"HF pipeline inference error: {exc}")

        # 4. SpeechRecognition (Google online) ────────────────────────────────
        if SR_AVAILABLE:
            try:
                recognizer = sr_lib.Recognizer()
                with sr_lib.AudioFile(wav_path) as src:
                    audio_data = recognizer.record(src)
                txt = recognizer.recognize_google(audio_data)
                if txt:
                    return {"transcript": txt}
            except sr_lib.UnknownValueError:
                return {"transcript": "(No clear speech detected in recorded audio)"}
            except sr_lib.RequestError as exc:
                logging.warning(f"Google SR API error: {exc}")
            except Exception as exc:
                logging.error(f"SpeechRecognition error: {exc}")

        error_msg = self._load_error or "No local or online ASR backends available."
        ffmpeg_tip = "" if self._ffmpeg else "\n- **FFMPEG missing**: Install ffmpeg and add to PATH."
        return {
            "transcript": (
                f"Transcription unavailable: {error_msg}{ffmpeg_tip}\n\n"
                "To resolve:\n"
                "1. Restart the backend.\n"
                "2. Visit http://localhost:5000/api/asr_status to see the detailed error.\n"
                "3. Ensure 'openai-whisper' is installed: pip install openai-whisper"
            )
        }


transcription_service = TranscriptionService()
