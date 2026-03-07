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
    # Ensure wav format for downstream processing
    if not path.suffix.lower() == ".wav":
        wav_path = dest / (path.stem + "_converted.wav")
        import subprocess
        cmd = ["ffmpeg", "-y", "-i", str(path), "-ar", "16000", "-ac", "1", str(wav_path)]
        try:
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception as e:
            pass # ffmpeg not found or failed, let it fall through
            
        if wav_path.exists():
            return str(wav_path)
    return str(path)

