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

# ── import optional deps ───────────────────────────────────────────────────────

WHISPER_AVAILABLE = False
whisper_mod = None
try:
    import whisper as _wmod
    whisper_mod = _wmod
    WHISPER_AVAILABLE = True
except ImportError:
    pass

FASTER_WHISPER_AVAILABLE = False
try:
    from faster_whisper import WhisperModel
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    pass

TRANSFORMERS_AVAILABLE = False
try:
    from transformers import pipeline as hf_pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    pass

SR_AVAILABLE = False
try:
    import speech_recognition as sr_lib
    SR_AVAILABLE = True
except ImportError:
    pass

LIBROSA_AVAILABLE = False
try:
    import librosa as _librosa
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


def _to_wav(audio_path: str) -> str:
    """Convert any audio to 16 kHz mono WAV. Returns converted path or original."""
    if os.path.splitext(audio_path)[1].lower() == ".wav":
        return audio_path

    wav_path = audio_path + "_c.wav"

    if _ffmpeg_ok():
        cmd = [
            "ffmpeg", "-y", "-i", audio_path,
            "-ar", "16000", "-ac", "1", "-f", "wav", wav_path
        ]
        try:
            subprocess.run(cmd, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, check=True)
            if Path(wav_path).exists():
                return wav_path
        except Exception as exc:
            logging.warning(f"ffmpeg conversion failed: {exc}")

    # Fallback: use librosa to decode + save as wav
    if LIBROSA_AVAILABLE:
        try:
            import soundfile as sf
            import librosa
            y, sr = librosa.load(audio_path, sr=16000, mono=True)
            sf.write(wav_path, y, 16000)
            return wav_path
        except Exception as exc:
            logging.warning(f"librosa/soundfile wav-save failed: {exc}")

    return audio_path   # give the original path to the model


# ── service ────────────────────────────────────────────────────────────────────

class TranscriptionService:

    def __init__(self):
        self._whisper   = None
        self._fw_model  = None
        self._hf_pipe   = None

        # 1. openai-whisper
        if WHISPER_AVAILABLE:
            try:
                logging.info("Loading openai-whisper tiny.en …")
                self._whisper = whisper_mod.load_model("tiny.en")
                logging.info("openai-whisper ready ✓")
            except Exception as exc:
                logging.warning(f"openai-whisper load error: {exc}")

        # 2. faster-whisper
        if not self._whisper and FASTER_WHISPER_AVAILABLE:
            try:
                logging.info("Loading faster-whisper tiny.en …")
                self._fw_model = WhisperModel("tiny.en", device="cpu",
                                              compute_type="float32")
                logging.info("faster-whisper ready ✓")
            except Exception as exc:
                logging.warning(f"faster-whisper load error: {exc}")

        # 3. transformers
        if not self._whisper and not self._fw_model and TRANSFORMERS_AVAILABLE:
            try:
                logging.info("Loading HF whisper-tiny.en …")
                self._hf_pipe = hf_pipeline(
                    "automatic-speech-recognition",
                    model="openai/whisper-tiny.en",
                    device=-1)
                logging.info("HF pipeline ready ✓")
            except Exception as exc:
                logging.warning(f"HF pipeline load error: {exc}")

        backends = [x for x in [self._whisper, self._fw_model, self._hf_pipe] if x]
        if not backends:
            if SR_AVAILABLE:
                logging.warning(
                    "No local ASR model loaded — will use SpeechRecognition (Google online).")
            else:
                logging.error(
                    "No ASR backend available! Run:\n"
                    "  pip install openai-whisper   (recommended)\n"
                    "  pip install SpeechRecognition  (online fallback)")

    # ──────────────────────────────────────────────────────────────────────────

    def transcribe(self, audio_path: str) -> Dict[str, str]:
        p = Path(audio_path)
        if not p.exists():
            return {"transcript": "(Audio file missing — check upload)"}

        # Convert to WAV for maximum compatibility
        wav_path = _to_wav(audio_path)

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

        return {
            "transcript": (
                "Transcription unavailable — install openai-whisper:\n"
                "  pip install openai-whisper"
            )
        }


transcription_service = TranscriptionService()
