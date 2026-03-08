"""
Video upload utilities.

Fixes applied:
- save_uploaded_video() now uses a UUID-prefixed filename instead of the
  raw FileStorage.filename. Using the client-supplied filename verbatim is
  a path-traversal vulnerability — a malicious client could upload a file
  named "../../config.py" and overwrite arbitrary files on the server.
- Added a whitelist of allowed video extensions; files with disallowed
  extensions are rejected with a ValueError rather than saved silently.
- extract_frames() placeholder is preserved unchanged (not yet implemented).
"""

import uuid
from pathlib import Path
from typing import Tuple

# Allowed video container formats
ALLOWED_VIDEO_EXTENSIONS = {".webm", ".mp4", ".mkv", ".mov", ".avi", ".ogv"}


def _safe_filename(original: str, fallback_ext: str = ".webm") -> str:
    """
    Return a UUID-based filename with the original file's extension.
    Strips any directory components from the client-supplied name to
    prevent path traversal attacks.
    """
    original_path = Path(original) if original else Path(fallback_ext)
    ext = original_path.suffix.lower() or fallback_ext
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise ValueError(
            f"Unsupported video format '{ext}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}"
        )
    return f"{uuid.uuid4().hex}{ext}"


def save_uploaded_video(file_storage, dest_dir: str) -> str:
    """
    Save an uploaded video (from Flask's FileStorage) to disk and return path.

    FIX: Uses a server-generated UUID filename instead of the client-supplied
    filename to prevent path traversal (e.g. filename='../../app.py').
    """
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)

    safe_name = _safe_filename(
        file_storage.filename or "",
        fallback_ext=".webm",
    )
    path = dest / safe_name
    file_storage.save(path)
    return str(path)


def extract_frames(video_path: str) -> Tuple[int, float]:
    """
    Placeholder for frame extraction. Returns fake frame count and fps for now.
    """
    _ = video_path
    return 120, 30.0