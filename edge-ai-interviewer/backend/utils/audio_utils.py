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
        import subprocess, shlex
        cmd = f"ffmpeg -y -i {shlex.quote(str(path))} -ar 16000 -ac 1 {shlex.quote(str(wav_path))}"
        subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return str(wav_path)
    return str(path)

