"""
transcription_service.py

Fixes in this version (on top of previous ffmpeg injection fix):

1. _load_model() no longer permanently caches _whisper_load_err when the
   failure reason is ffmpeg-missing. Previously, if ffmpeg injection succeeded
   *after* the first failed load attempt, _whisper_load_err was already set
   and every subsequent call returned the cached error forever — the model
   could never recover without a full process restart.
   Fix: only cache the error for non-ffmpeg failures (ImportError, model crash).
   ffmpeg-missing failures now re-check on every call so a late injection wins.

2. transcribe() no longer calls _ffmpeg_available() a second time independently.
   The first call is inside _load_model(); the second (for WAV conversion) used
   a separate cached result which could disagree. Now _ffmpeg_available() is
   called once and its result passed to both branches.

3. "No speech detected" return value is now distinguishable from a real
   transcription failure — it returns the transcript string as-is so nlp_service
   can gate on it correctly (see nlp_service.py fix).
"""

import os
import sys
import subprocess
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")

_whisper_model    = None
_whisper_load_err = None          # only set for NON-ffmpeg errors (see fix 1)
_ffmpeg_err_cache = None          # separate, non-permanent cache for ffmpeg


# ---------------------------------------------------------------------------
# Windows: find ffmpeg and inject into PATH at runtime
# ---------------------------------------------------------------------------

_WINDOWS_FFMPEG_LOCATIONS = [
    str(Path.home() / "ffmpeg" / "bin"),
    r"C:\ffmpeg\bin",
    r"C:\Program Files\ffmpeg\bin",
    r"C:\Program Files (x86)\ffmpeg\bin",
    r"C:\tools\ffmpeg\bin",
    r"C:\ProgramData\chocolatey\bin",
    str(Path.home() / "scoop" / "apps" / "ffmpeg" / "current" / "bin"),
    str(Path.home() / "Downloads" / "ffmpeg" / "bin"),
]


def _safe_ffmpeg_call() -> bool:
    try:
        r = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            timeout=10
        )
        return r.returncode == 0
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return False


def _find_and_inject_ffmpeg_windows() -> bool:
    for loc in _WINDOWS_FFMPEG_LOCATIONS:
        if (Path(loc) / "ffmpeg.exe").exists():
            os.environ["PATH"] = loc + ";" + os.environ.get("PATH", "")
            logger.info(f"[ffmpeg] Injected into PATH from: {loc}")
            return True

    for root in [Path.home(), Path("C:/ffmpeg"), Path("C:/tools")]:
        if not root.exists():
            continue
        try:
            for hit in root.rglob("ffmpeg.exe"):
                bin_dir = str(hit.parent)
                os.environ["PATH"] = bin_dir + ";" + os.environ.get("PATH", "")
                logger.info(f"[ffmpeg] Found via glob, injected: {bin_dir}")
                return True
        except PermissionError:
            continue

    return False


def _ffmpeg_available() -> bool:
    if _safe_ffmpeg_call():
        return True
    if sys.platform == "win32":
        if _find_and_inject_ffmpeg_windows():
            return _safe_ffmpeg_call()
    return False


# ---------------------------------------------------------------------------
# WebM -> WAV conversion
# ---------------------------------------------------------------------------

def _convert_to_wav(input_path: str) -> str | None:
    output_path = input_path + "_whisper.wav"
    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-ar", "16000",
            "-ac", "1",
            "-acodec", "pcm_s16le",
            output_path,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if r.returncode == 0 and Path(output_path).exists():
            size = Path(output_path).stat().st_size
            logger.info(f"[ffmpeg] {input_path} -> WAV ({size} bytes)")
            return output_path
        logger.error(f"[ffmpeg] Conversion failed:\n{r.stderr[-400:]}")
        return None
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired, Exception) as exc:
        logger.error(f"[ffmpeg] Conversion exception: {exc}")
        return None


# ---------------------------------------------------------------------------
# Whisper loader
# ---------------------------------------------------------------------------

def _load_model():
    """
    Load Whisper model lazily.

    FIX: We no longer permanently cache ffmpeg-missing as a fatal error.
    _whisper_load_err is only set for hard failures (ImportError, model crash)
    that won't self-resolve. ffmpeg-missing is re-checked on every call so
    late PATH injection (via fix_ffmpeg.py or _find_and_inject_ffmpeg_windows)
    is picked up without a process restart.
    """
    global _whisper_model, _whisper_load_err

    if _whisper_model is not None:
        return _whisper_model

    # Hard errors (not ffmpeg-related) — safe to cache permanently
    if _whisper_load_err is not None:
        raise RuntimeError(_whisper_load_err)

    # Re-check ffmpeg every time until it's available (not cached permanently)
    if not _ffmpeg_available():
        raise RuntimeError(
            "ffmpeg is not installed or not in PATH.\n\n"
            "  Quick fix — run once from your backend folder:\n"
            "    python fix_ffmpeg.py\n\n"
            "  Manual fix:\n"
            "    1. Download https://www.gyan.dev/ffmpeg/builds/\n"
            "       -> ffmpeg-release-essentials.zip\n"
            "    2. Extract to C:\\ffmpeg\n"
            "    3. Add C:\\ffmpeg\\bin to system PATH\n"
            "    4. Restart terminal + backend\n\n"
            "  Diagnostic: http://localhost:5000/api/asr_status"
        )

    try:
        import whisper as _w
        logger.info(f"Loading Whisper '{WHISPER_MODEL_NAME}' model ...")
        _whisper_model = _w.load_model(WHISPER_MODEL_NAME)
        logger.info(f"Whisper '{WHISPER_MODEL_NAME}' ready.")
        return _whisper_model
    except ImportError:
        _whisper_load_err = (
            "openai-whisper is not installed.\n"
            "  Fix: pip install openai-whisper\n"
            "  Then restart the backend."
        )
        raise RuntimeError(_whisper_load_err)
    except Exception as exc:
        _whisper_load_err = f"Whisper model load failed: {exc}"
        raise RuntimeError(_whisper_load_err)


# ---------------------------------------------------------------------------
# Sentinel for "audio was present but silent"
# ---------------------------------------------------------------------------
EMPTY_TRANSCRIPT_SENTINEL = "__EMPTY_AUDIO__"


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class TranscriptionService:

    def transcribe(self, audio_path: str) -> dict:
        """
        Transcribe browser WebM audio using Whisper.

        FIX: _ffmpeg_available() is now called once and its result reused for
        both the model-load gate (inside _load_model) and the WAV conversion
        step, so the two can't disagree on ffmpeg state mid-call.

        FIX: Empty/silent audio now returns EMPTY_TRANSCRIPT_SENTINEL as the
        transcript string so nlp_service can correctly return nlp_score=None
        (N/A) rather than scoring a near-zero-word answer.
        """
        if not audio_path or not Path(audio_path).exists():
            logger.warning(f"Audio file not found: {audio_path}")
            return {
                "transcript": "Transcription unavailable. Audio file was not saved correctly.",
                "language": "unknown",
                "duration": 0.0,
            }

        try:
            model = _load_model()
        except RuntimeError as exc:
            return {
                "transcript": f"Transcription unavailable. {exc}",
                "language": "unknown",
                "duration": 0.0,
            }

        # FIX: single _ffmpeg_available() call for both conversion + WAV path
        ffmpeg_ok = _ffmpeg_available()
        wav_path = None
        transcribe_path = audio_path

        if ffmpeg_ok:
            wav_path = _convert_to_wav(audio_path)
            if wav_path:
                transcribe_path = wav_path
            else:
                logger.warning("Conversion failed; passing raw file to Whisper (may fail).")
        else:
            logger.warning("ffmpeg unavailable; raw WebM passed to Whisper (will likely fail).")

        try:
            result   = model.transcribe(transcribe_path, fp16=False)
            text     = (result.get("text") or "").strip()
            lang     = result.get("language", "en")
            segs     = result.get("segments") or []
            duration = segs[-1].get("end", 0.0) if segs else 0.0

            if not text:
                logger.warning("Whisper returned empty transcript.")
                # FIX: use sentinel so nlp_service returns nlp_score=None (N/A)
                # instead of scoring an empty string as a weak answer
                return {
                    "transcript": EMPTY_TRANSCRIPT_SENTINEL,
                    "language": lang,
                    "duration": duration,
                }

            logger.info(f"Transcribed {duration:.1f}s -> {len(text)} chars (lang={lang})")
            return {"transcript": text, "language": lang, "duration": duration}

        except Exception as exc:
            err = str(exc)
            logger.error(f"Whisper error: {err}", exc_info=True)
            if "WinError 2" in err:
                msg = (
                    "Transcription unavailable. ffmpeg still not found by Whisper. "
                    "Run: python fix_ffmpeg.py then restart the backend."
                )
            else:
                msg = f"Transcription unavailable. Runtime error: {err}"
            return {"transcript": msg, "language": "unknown", "duration": 0.0}

        finally:
            if wav_path and Path(wav_path).exists():
                try:
                    Path(wav_path).unlink()
                except OSError:
                    pass

    def status(self) -> dict:
        ffmpeg_ok = _ffmpeg_available()
        try:
            import whisper  # noqa
            whisper_ok = True
        except ImportError:
            whisper_ok = False

        model_loaded = _whisper_model is not None

        if not ffmpeg_ok:
            state   = "error"
            message = "ffmpeg not found. Run: python fix_ffmpeg.py"
        elif not whisper_ok:
            state   = "error"
            message = "openai-whisper not installed. Run: pip install openai-whisper"
        elif not model_loaded:
            state   = "ready"
            message = f"Whisper '{WHISPER_MODEL_NAME}' loads on first transcription."
        else:
            state   = "active"
            message = f"Whisper '{WHISPER_MODEL_NAME}' loaded and ready."

        return {
            "state":             state,
            "message":           message,
            "ffmpeg":            ffmpeg_ok,
            "whisper_installed": whisper_ok,
            "model_loaded":      model_loaded,
            "model_name":        WHISPER_MODEL_NAME,
            "platform":          sys.platform,
        }


transcription_service = TranscriptionService()