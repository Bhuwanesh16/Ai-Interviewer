"""
fix_ffmpeg.py — Download, install and PATH-fix ffmpeg on Windows for Whisper.

Run from your backend folder (venv activated):
    python fix_ffmpeg.py
"""

import os, sys, subprocess, zipfile, shutil, tempfile, ctypes, winreg, urllib.request
from pathlib import Path

# ── Where to install ──────────────────────────────────────────────────────────
INSTALL_DIR = Path("C:/ffmpeg")          # installs to C:\ffmpeg\bin\ffmpeg.exe

# ── Download URL (BtbN official GPL Windows build) ────────────────────────────
DOWNLOAD_URL = (
    "https://github.com/BtbN/ffmpeg-builds/releases/download/latest/"
    "ffmpeg-master-latest-win64-gpl.zip"
)

# ── Common places to search first (saves re-downloading) ─────────────────────
SEARCH_DIRS = [
    r"C:\ffmpeg\bin",
    r"C:\Program Files\ffmpeg\bin",
    r"C:\tools\ffmpeg\bin",
    str(Path.home() / "ffmpeg" / "bin"),
    str(Path.home() / "Downloads" / "ffmpeg" / "bin"),
    r"C:\ProgramData\chocolatey\bin",
    str(Path.home() / "scoop" / "apps" / "ffmpeg" / "current" / "bin"),
]


def ffmpeg_callable() -> bool:
    """Check if ffmpeg.exe is callable WITHOUT raising FileNotFoundError."""
    try:
        r = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            timeout=10
        )
        return r.returncode == 0
    except (FileNotFoundError, OSError):
        return False


def find_existing() -> str | None:
    """Look for an already-downloaded ffmpeg.exe on this machine."""
    for d in SEARCH_DIRS:
        if (Path(d) / "ffmpeg.exe").exists():
            return d
    # Wider glob (may be slow on large drives, keep shallow)
    for root in [Path.home(), Path("C:/ffmpeg"), Path("C:/tools")]:
        if not root.exists():
            continue
        for hit in root.rglob("ffmpeg.exe"):
            return str(hit.parent)
    return None


def add_to_user_path(new_dir: str):
    """Write new_dir into HKCU\\Environment\\PATH permanently."""
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, r"Environment",
            0, winreg.KEY_READ | winreg.KEY_WRITE
        )
        try:
            val, _ = winreg.QueryValueEx(key, "PATH")
        except FileNotFoundError:
            val = ""
        parts = [p for p in val.split(";") if p.strip()]
        if new_dir not in parts:
            parts.append(new_dir)
            winreg.SetValueEx(key, "PATH", 0, winreg.REG_EXPAND_SZ, ";".join(parts))
            print(f"  ✓ Permanently added to user PATH: {new_dir}")
        else:
            print(f"  ✓ Already in user PATH: {new_dir}")
        winreg.CloseKey(key)
        # Broadcast so new terminals pick it up immediately
        ctypes.windll.user32.SendMessageTimeoutW(
            0xFFFF, 0x001A, 0, "Environment", 2, 5000, None
        )
    except Exception as e:
        print(f"  ⚠  Registry update failed: {e}")
        print(f"     Add manually:  {new_dir}")


def inject_path(bin_dir: str):
    """Add bin_dir to PATH for the current running process."""
    os.environ["PATH"] = bin_dir + ";" + os.environ.get("PATH", "")


def download_ffmpeg() -> str | None:
    """Download the official ffmpeg zip and extract to INSTALL_DIR."""
    print(f"\n  Downloading ffmpeg to {INSTALL_DIR} ...")
    print(f"  Source: {DOWNLOAD_URL}")
    print("  (This is ~90MB — please wait)\n")

    zip_tmp = Path(tempfile.gettempdir()) / "ffmpeg_win64.zip"

    def _show_progress(count, block, total):
        done = count * block
        pct  = min(int(done * 100 / total), 100) if total > 0 else 0
        bar  = "#" * (pct // 5) + "-" * (20 - pct // 5)
        print(f"\r  [{bar}] {pct}%  ({done//1024//1024}MB)", end="", flush=True)

    try:
        urllib.request.urlretrieve(DOWNLOAD_URL, zip_tmp, _show_progress)
        print()  # newline after progress bar
        print(f"  ✓ Downloaded ({zip_tmp.stat().st_size // 1024 // 1024}MB)")
    except Exception as e:
        print(f"\n  ✗ Download failed: {e}")
        print("\n  Download manually:")
        print("    https://www.gyan.dev/ffmpeg/builds/")
        print("    -> ffmpeg-release-essentials.zip")
        print(f"   Extract the 'bin' folder so you have: C:\\ffmpeg\\bin\\ffmpeg.exe")
        return None

    # Extract zip
    print("  Extracting...")
    extract_tmp = Path(tempfile.gettempdir()) / "ffmpeg_extract"
    if extract_tmp.exists():
        shutil.rmtree(extract_tmp)

    try:
        with zipfile.ZipFile(zip_tmp, "r") as zf:
            zf.extractall(extract_tmp)
    except Exception as e:
        print(f"  ✗ Extraction failed: {e}")
        return None
    finally:
        zip_tmp.unlink(missing_ok=True)

    # Find ffmpeg.exe inside the extracted folder
    hits = list(extract_tmp.rglob("ffmpeg.exe"))
    if not hits:
        print("  ✗ ffmpeg.exe not found inside zip.")
        return None

    src_bin = hits[0].parent   # e.g. .../ffmpeg-xxx/bin

    # Move to INSTALL_DIR
    if INSTALL_DIR.exists():
        shutil.rmtree(INSTALL_DIR)
    shutil.move(str(src_bin.parent), str(INSTALL_DIR))

    # Final bin location
    bin_dir = INSTALL_DIR / "bin"
    if not (bin_dir / "ffmpeg.exe").exists():
        # Some builds put ffmpeg.exe directly in the root
        bin_dir = INSTALL_DIR
        if not (bin_dir / "ffmpeg.exe").exists():
            print(f"  ✗ Could not locate ffmpeg.exe under {INSTALL_DIR}")
            return None

    print(f"  ✓ Installed to {bin_dir}")
    shutil.rmtree(extract_tmp, ignore_errors=True)
    return str(bin_dir)


def verify_whisper():
    print("\n  Checking Whisper end-to-end...")
    try:
        import whisper
    except ImportError:
        print("  ✗ openai-whisper not installed!")
        print("    Fix: pip install openai-whisper")
        return False

    import wave, struct
    tmp = Path(tempfile.gettempdir()) / "silence_test.wav"
    try:
        with wave.open(str(tmp), "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(struct.pack("<" + "h" * 1600, *([0] * 1600)))

        model = whisper.load_model("base")
        model.transcribe(str(tmp), fp16=False)
        print("  ✓ Whisper + ffmpeg pipeline working!")
        return True
    except Exception as e:
        err = str(e)
        if "WinError 2" in err:
            print("  ✗ Whisper still can't call ffmpeg.")
            print("    Open a NEW PowerShell window, activate venv, then:")
            print("    python app.py")
        else:
            print(f"  ⚠  Whisper error: {err}")
        return False
    finally:
        tmp.unlink(missing_ok=True)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("\nInterviewAI — Windows ffmpeg Installer")
    print("=" * 42)

    # 1. Already works?
    if ffmpeg_callable():
        print("  ✓ ffmpeg already in PATH and working!")
        verify_whisper()
        print("\n  Restart Flask:  python app.py\n")
        return

    # 2. Installed somewhere but not in PATH?
    print("  Searching for existing ffmpeg installation...")
    bin_dir = find_existing()

    if bin_dir:
        print(f"  ✓ Found at: {bin_dir}")
        print("  Injecting into PATH for this session + registry...")
        inject_path(bin_dir)
        add_to_user_path(bin_dir)
    else:
        print("  Not found. Downloading now...")
        bin_dir = download_ffmpeg()
        if not bin_dir:
            print("\n  ✗ Setup failed. See manual instructions above.")
            sys.exit(1)
        inject_path(bin_dir)
        add_to_user_path(bin_dir)

    # 3. Confirm callable now
    if ffmpeg_callable():
        print("  ✓ ffmpeg is callable in this session!")
    else:
        print("  ⚠  ffmpeg not callable yet in this process.")
        print("     Open a NEW terminal, activate venv, then run: python app.py")

    # 4. Verify Whisper
    verify_whisper()

    print("\n" + "=" * 42)
    print("  Done!  Restart your backend:")
    print("    python app.py")
    print("  Content Relevance will now appear on results.\n")


if __name__ == "__main__":
    main()