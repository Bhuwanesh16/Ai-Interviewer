"""
Audio upload utilities.

Fixes applied:
- save_uploaded_audio() now uses a UUID-prefixed filename instead of the
  raw FileStorage.filename to prevent path traversal attacks (same issue
  as video_utils.py).
- Added a whitelist of allowed audio extensions.
- ffmpeg conversion: original non-WAV file is deleted after a successful
  conversion to avoid leaving raw upload blobs on disk indefinitely.
- Bare `except Exception as e: pass` replaced with a logged warning so
  ffmpeg failures are visible in production logs instead of silently ignored.
- subprocess.run now uses check=False explicitly and captures stderr for
  logging; also uses timeout=60 to prevent hung ffmpeg processes from
  blocking a worker indefinitely.
"""

import logging
import subprocess
import uuid
from pathlib import Path

# Allowed audio/video-with-audio container formats
ALLOWED_AUDIO_EXTENSIONS = {".webm", ".wav", ".mp3", ".ogg", ".m4a", ".opus", ".mp4"}


def _safe_filename(original: str, fallback_ext: str = ".webm") -> str:
    """
    Return a UUID-based filename preserving only the file extension.
    Strips directory components to prevent path traversal.
    """
    original_path = Path(original) if original else Path(fallback_ext)
    ext = original_path.suffix.lower() or fallback_ext
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise ValueError(
            f"Unsupported audio format '{ext}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}"
        )
    return f"{uuid.uuid4().hex}{ext}"


def save_uploaded_audio(file_storage, dest_dir: str) -> str:
    """
    Save an uploaded audio file to disk and return the path to a 16 kHz
    mono WAV suitable for downstream ASR/speech analysis.

    Conversion pipeline:
      1. Save the raw upload with a safe UUID filename.
      2. If not already a WAV, attempt ffmpeg conversion → 16 kHz mono WAV.
      3. On success, delete the raw upload to avoid accumulating blobs.
      4. On failure, return the raw path and let the transcription service
         handle format negotiation itself.
    """
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)

    # FIX: Use server-generated UUID name — never trust client filename
    safe_name = _safe_filename(file_storage.filename or "", fallback_ext=".webm")
    raw_path = dest / safe_name
    file_storage.save(raw_path)

    # Already a WAV — nothing to convert
    if raw_path.suffix.lower() == ".wav":
        return str(raw_path)

    wav_path = dest / (raw_path.stem + "_converted.wav")
    cmd = [
        "ffmpeg", "-y", "-i", str(raw_path),
        "-ar", "16000", "-ac", "1",
        str(wav_path),
    ]
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            check=False,
            timeout=60,          # FIX: prevent hung ffmpeg from blocking a worker
            text=True,
        )
        if result.returncode != 0:
            # FIX: was bare `pass` — now logged so ops can diagnose mic issues
            logging.warning(
                f"ffmpeg audio conversion failed (code={result.returncode}): "
                f"{result.stderr[-300:] if result.stderr else 'no stderr'}"
            )
        elif wav_path.exists() and wav_path.stat().st_size > 0:
            # FIX: delete the raw upload blob after successful conversion
            # to avoid accumulating .webm/.opus files in the upload directory
            try:
                raw_path.unlink()
            except OSError as e:
                logging.warning(f"Could not remove raw upload {raw_path}: {e}")
            return str(wav_path)

    except FileNotFoundError:
        logging.warning("ffmpeg not found — audio delivered unconverted to transcription service.")
    except subprocess.TimeoutExpired:
        logging.error(f"ffmpeg timed out converting {raw_path}. Killing process.")
    except Exception as e:
        logging.warning(f"Unexpected error during audio conversion: {e}")

    # Fallback: return the original raw path and let TranscriptionService handle it
    return str(raw_path)