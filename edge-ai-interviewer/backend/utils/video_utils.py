from pathlib import Path
from typing import Tuple


def save_uploaded_video(file_storage, dest_dir: str) -> str:
    """
    Save an uploaded video (from Flask's FileStorage) to disk and return path.
    """
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    filename = file_storage.filename or "interview_video.webm"
    path = dest / filename
    file_storage.save(path)
    return str(path)


def extract_frames(video_path: str) -> Tuple[int, float]:
    """
    Placeholder for frame extraction. Returns fake frame count and fps for now.
    """
    _ = video_path
    return 120, 30.0

