from pathlib import Path


def save_uploaded_audio(file_storage, dest_dir: str) -> str:
    """
    Save an uploaded audio file to disk and return path.
    """
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    filename = file_storage.filename or "interview_audio.webm"
    path = dest / filename
    file_storage.save(path)
    return str(path)

