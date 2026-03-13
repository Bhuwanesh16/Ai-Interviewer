import os
from pathlib import Path

whisper_cache = Path.home() / ".cache" / "whisper"
print(f"Checking {whisper_cache} ...")
if whisper_cache.exists():
    print("Files found:", list(whisper_cache.glob("*")))
else:
    print("Whisper cache directory does not exist.")
