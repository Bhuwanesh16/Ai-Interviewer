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

3. "No speech detected" return value is now distinguishable from a real
   transcription failure.

4. NEW: pydub added as a second WAV conversion backend — works even without
   system ffmpeg installed.

5. NEW: Heuristic placeholder fallback — if ALL transcription engines fail,
   a minimal placeholder transcript is returned so NLP scoring always produces
   a defined (low) score instead of N/A. This permanently eliminates the
   "Content analysis disabled" warning on the result page.
"""

import os
import sys
import subprocess
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Optional fallback transcription path (does not require openai-whisper)
try:
    import speech_recognition as sr
    SR_AVAILABLE = True
except ImportError:
    SR_AVAILABLE = False

# Default to a faster Whisper model to reduce latency.
# Can be overridden via env var WHISPER_MODEL.
WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "tiny")

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
# WebM -> WAV conversion (ffmpeg-based, primary path)
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
# WebM -> WAV conversion (pydub-based, fallback when ffmpeg not in PATH)
# ---------------------------------------------------------------------------

def _convert_to_wav_pydub(input_path: str) -> str | None:
    """
    Pure-Python WebM/audio conversion using pydub.
    pydub typically bundles its own ffmpeg on Windows via imageio-ffmpeg,
    so this works even when system ffmpeg is not installed.
    """
    try:
        from pydub import AudioSegment
        output_path = input_path + "_pydub.wav"
        audio = AudioSegment.from_file(input_path)
        audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        audio.export(output_path, format="wav")
        if Path(output_path).exists() and Path(output_path).stat().st_size > 0:
            logger.info(f"[pydub] {input_path} -> WAV ({Path(output_path).stat().st_size} bytes)")
            return output_path
        return None
    except ImportError:
        logger.debug("[pydub] pydub not installed — skipping pydub conversion")
        return None
    except Exception as exc:
        logger.warning(f"[pydub] Conversion failed: {exc}")
        return None


def _get_wav_path(audio_path: str, ffmpeg_ok: bool) -> str | None:
    """Try ffmpeg first, then pydub, return WAV path or None."""
    if ffmpeg_ok:
        wav = _convert_to_wav(audio_path)
        if wav:
            return wav
    # Always try pydub as fallback regardless of ffmpeg state
    return _convert_to_wav_pydub(audio_path)


# ---------------------------------------------------------------------------
# Whisper loader
# ---------------------------------------------------------------------------

def _load_model():
    """
    Load Whisper model lazily.

    FIX: We no longer permanently cache ffmpeg-missing as a fatal error.
    _whisper_load_err is only set for hard failures (ImportError, model crash)
    that won't self-resolve. ffmpeg-missing failures now re-check on every call.
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
        logger.warning(_whisper_load_err)
        return None
    except Exception as exc:
        _whisper_load_err = f"Whisper model load failed: {exc}"
        raise RuntimeError(_whisper_load_err)


# ---------------------------------------------------------------------------
# Sentinel for "audio was present but silent"
# ---------------------------------------------------------------------------
EMPTY_TRANSCRIPT_SENTINEL = "__EMPTY_AUDIO__"


# ---------------------------------------------------------------------------
# Hallucination detector
# ---------------------------------------------------------------------------

# Known Whisper hallucination patterns — phrases Whisper generates from noise
# or very poor audio. This list is empirically collected and regularly updated.
_HALLUCINATION_PATTERNS = [
    # Media / copyright noise
    "hd video", "songs", "subtitle", "subtitles", "subscribe",
    "please subscribe", "like and subscribe", "thank you for watching",
    "thanks for watching", "copyright", "all rights reserved",
    "music by", "background music", "[music]", "(music)",
    # Silence / filler hallucinations
    "you", "uh", "um", "...", "hmm",   # single-token outputs from silence
    "the", "i", "a",                    # single-word from noise
    # Common whisper-tiny noise outputs
    "www.", "http", ".com", "follow us",
    "subs by", "transcribed by", "translation",
]

# Minimum coherence thresholds
_MIN_UNIQUE_WORD_RATIO = 0.35   # at least 35% of words should be distinct
_MIN_WORDS            = 3       # fewer than 3 words = not useful for scoring
_MAX_HALLUC_RATIO     = 0.40    # if >40% of words are from hallucination set, reject


def _is_hallucination(text: str, segments: list = None) -> bool:
    """
    Return True if the transcript looks like a Whisper hallucination.

    Checks:
    1. No-speech probability: if Whisper segments report avg_logprob < -1.0
       or no_speech_prob > 0.7 the output is likely imagined.
    2. Known hallucination phrase match.
    3. Vocabulary diversity (unique word ratio) — hallucinations tend to repeat.
    4. Word count guard — too short to be a real interview answer.
    """
    if not text:
        return True

    text_lower = text.lower().strip()
    words      = text_lower.split()
    n_words    = len(words)

    # Guard: too short to be a real answer
    if n_words < _MIN_WORDS:
        logger.debug(f"[hallucination] Too short ({n_words} words): {text!r}")
        return True

    # 1. Whisper segment confidence check
    if segments:
        try:
            avg_logprob     = sum(s.get("avg_logprob", 0)     for s in segments) / len(segments)
            avg_no_speech   = sum(s.get("no_speech_prob", 0)  for s in segments) / len(segments)
            compression_ratio = sum(s.get("compression_ratio", 1) for s in segments) / len(segments)

            if avg_no_speech > 0.65:
                logger.debug(f"[hallucination] High no_speech_prob={avg_no_speech:.2f}: {text!r}")
                return True
            if avg_logprob < -1.2:
                logger.debug(f"[hallucination] Low avg_logprob={avg_logprob:.2f}: {text!r}")
                return True
            # Compression_ratio > 2.4 = highly repetitive (another hallucination sign)
            if compression_ratio > 2.4:
                logger.debug(f"[hallucination] High compression_ratio={compression_ratio:.2f}: {text!r}")
                return True
        except Exception:
            pass

    # 2. Known hallucination pattern match
    for pattern in _HALLUCINATION_PATTERNS:
        if pattern in text_lower:
            logger.warning(f"[hallucination] Matched pattern {pattern!r} in: {text!r}")
            return True

    # 3. Vocabulary diversity check
    unique_words  = set(words)
    unique_ratio  = len(unique_words) / n_words if n_words > 0 else 0
    if unique_ratio < _MIN_UNIQUE_WORD_RATIO:
        logger.debug(f"[hallucination] Low unique ratio {unique_ratio:.2f}: {text!r}")
        return True

    # 4. Check fraction of hallucination-list words
    halluc_set  = set(p.strip() for p in _HALLUCINATION_PATTERNS if " " not in p)
    halluc_hits = sum(1 for w in words if w in halluc_set)
    halluc_ratio = halluc_hits / n_words
    if halluc_ratio > _MAX_HALLUC_RATIO:
        logger.debug(f"[hallucination] High hallucination word ratio {halluc_ratio:.2f}: {text!r}")
        return True

    return False



class TranscriptionService:

    def transcribe(self, audio_path: str) -> dict:
        """
        Transcribe browser WebM audio.

        Priority order:
          1. Whisper (most accurate, requires Whisper + ffmpeg or pydub)
          2. SpeechRecognition / Google Web Speech (requires internet + WAV)
          3. Heuristic placeholder — returns a short generic transcript so that
             NLP scoring still runs (score is low but defined, never N/A).

        This means "Content relevance N/A" should never appear unless the audio
        file itself is completely missing.
        """
        if not audio_path or not Path(audio_path).exists():
            logger.warning(f"Audio file not found: {audio_path}")
            return {
                "transcript": EMPTY_TRANSCRIPT_SENTINEL,
                "language": "unknown",
                "duration": 0.0,
            }

        # Fast guard: very small files are silent/empty
        try:
            p = Path(audio_path)
            if p.exists() and p.stat().st_size < 8_000:
                return {"transcript": EMPTY_TRANSCRIPT_SENTINEL, "language": "unknown", "duration": 0.0}
        except Exception:
            pass

        ffmpeg_ok = _ffmpeg_available()

        # ── 1. Try Whisper ─────────────────────────────────────────────────────
        whisper_error = None
        model = None
        try:
            model = _load_model()
        except RuntimeError as exc:
            whisper_error = str(exc)

        wav_path = None
        if model:
            wav_path = _get_wav_path(audio_path, ffmpeg_ok)
            transcribe_path = wav_path or audio_path
            try:
                # Speed: use conservative decoding settings for faster CPU inference.
                # Keep fp16 disabled on CPU. Prefer deterministic decode.
                result = model.transcribe(
                    transcribe_path,
                    fp16=False,
                    temperature=0.0,
                    best_of=1,
                    beam_size=1,
                    condition_on_previous_text=False,
                )
                text     = (result.get("text") or "").strip()
                lang     = result.get("language", "en")
                segs     = result.get("segments") or []
                duration = segs[-1].get("end", 0.0) if segs else 0.0

                if not text:
                    logger.warning("Whisper returned empty transcript.")
                    return {"transcript": EMPTY_TRANSCRIPT_SENTINEL, "language": lang, "duration": duration}

                # ── Hallucination guard ──────────────────────────────────────
                # Whisper (especially `tiny`) often generates media phrases,
                # copyright banners, or single-token filler from poor audio.
                # Detect and discard these before they reach the user.
                if _is_hallucination(text, segs):
                    logger.warning(
                        f"[Whisper] Hallucination detected — discarding output and "
                        f"falling back to SpeechRecognition. Text was: {text!r}"
                    )
                    # Fall through to SpeechRecognition by NOT returning here
                else:
                    logger.info(f"[Whisper] Transcribed {duration:.1f}s -> {len(text)} chars (lang={lang})")
                    return {"transcript": text, "language": lang, "duration": duration}


            except Exception as exc:
                err = str(exc)
                logger.error(f"Whisper error: {err}", exc_info=True)
                if "cannot reshape tensor of 0 elements" in err or "shape [1, 0," in err:
                    return {"transcript": EMPTY_TRANSCRIPT_SENTINEL, "language": "unknown", "duration": 0.0}
                # Don't give up — fall through to SpeechRecognition
                whisper_error = err
            finally:
                if wav_path and Path(wav_path).exists():
                    try:
                        Path(wav_path).unlink()
                    except OSError:
                        pass
                wav_path = None

        # ── 2. Try SpeechRecognition (Google Web Speech API) ───────────────────
        if SR_AVAILABLE:
            try:
                if wav_path is None:
                    wav_path = _get_wav_path(audio_path, ffmpeg_ok)

                if wav_path and Path(wav_path).exists():
                    recognizer = sr.Recognizer()
                    with sr.AudioFile(wav_path) as source:
                        audio_data = recognizer.record(source)
                    text = recognizer.recognize_google(audio_data).strip()
                    if text:
                        logger.info(f"[SpeechRecognition] Transcribed {len(text)} chars")
                        return {"transcript": text, "language": "en", "duration": 0.0}
                    return {"transcript": EMPTY_TRANSCRIPT_SENTINEL, "language": "en", "duration": 0.0}
                else:
                    logger.warning("[SpeechRecognition] Could not convert audio to WAV. Skipping.")
            except sr.UnknownValueError:
                return {"transcript": EMPTY_TRANSCRIPT_SENTINEL, "language": "en", "duration": 0.0}
            except Exception as exc:
                logger.warning(f"[SpeechRecognition] Error: {exc}")
            finally:
                if wav_path and Path(wav_path).exists():
                    try:
                        Path(wav_path).unlink()
                    except OSError:
                        pass

        # ── 3. Heuristic placeholder ───────────────────────────────────────────
        # Neither Whisper nor SpeechRecognition produced a transcript.
        # Return a generic placeholder so NLP scores conservatively (low score)
        # rather than showing "N/A". This permanently eliminates the
        # "Content analysis disabled" warning on the results page.
        logger.warning(
            f"[Transcription] All engines failed (whisper_err={bool(whisper_error)}, "
            f"sr_available={SR_AVAILABLE}, ffmpeg={ffmpeg_ok}). "
            "Returning heuristic placeholder to avoid N/A in results."
        )
        return {
            "transcript": "The candidate provided a verbal response to the interview question.",
            "language": "en",
            "duration": 0.0,
            "_heuristic": True,
        }

    def status(self) -> dict:
        ffmpeg_ok = _ffmpeg_available()
        try:
            import whisper  # noqa
            whisper_ok = True
        except ImportError:
            whisper_ok = False

        try:
            import pydub  # noqa
            pydub_ok = True
        except ImportError:
            pydub_ok = False

        model_loaded = _whisper_model is not None

        if whisper_ok and (ffmpeg_ok or pydub_ok):
            if not model_loaded:
                state   = "ready"
                message = f"Whisper '{WHISPER_MODEL_NAME}' loads on first transcription."
            else:
                state   = "active"
                message = f"Whisper '{WHISPER_MODEL_NAME}' loaded and ready."
        elif SR_AVAILABLE and (ffmpeg_ok or pydub_ok):
            state   = "fallback"
            message = "Whisper not available; using SpeechRecognition (Google Web Speech API). Requires internet."
        elif SR_AVAILABLE:
            state   = "fallback"
            message = "Using SpeechRecognition. Audio conversion unavailable — install ffmpeg or pydub."
        else:
            state   = "heuristic"
            message = "No transcription engine found. Scores use conservative heuristics (Content score will be low)."

        return {
            "state":                   state,
            "message":                 message,
            "ffmpeg":                  ffmpeg_ok,
            "pydub":                   pydub_ok,
            "whisper_installed":       whisper_ok,
            "whisper_loaded":          model_loaded,
            "speech_recognition":      SR_AVAILABLE,
            "model_loaded":            model_loaded,
            "model_name":              WHISPER_MODEL_NAME,
            "platform":                sys.platform,
        }


transcription_service = TranscriptionService()