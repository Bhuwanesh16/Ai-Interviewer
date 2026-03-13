#!/usr/bin/env python3
"""
setup_asr.py — One-shot setup for InterviewAI transcription + question generation.

Run from your project root:
    python setup_asr.py

What this does:
1. Checks / installs ffmpeg (required by Whisper for audio decoding)
2. Installs openai-whisper
3. Downloads the 'base' Whisper model (~150MB, fastest that's still accurate)
4. Verifies Ollama is running and llama3 model is pulled
5. Prints a clear status report
"""

import subprocess
import sys
import os
import platform
import urllib.request
import json

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def ok(msg):   print(f"  {GREEN}✓{RESET}  {msg}")
def warn(msg): print(f"  {YELLOW}⚠{RESET}  {msg}")
def fail(msg): print(f"  {RED}✗{RESET}  {msg}")
def info(msg): print(f"  {CYAN}→{RESET}  {msg}")


# ── 1. ffmpeg ─────────────────────────────────────────────────────────────────
def check_ffmpeg():
    print(f"\n{BOLD}[1/4] Checking ffmpeg{RESET}")
    result = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True)
    if result.returncode == 0:
        version_line = result.stdout.splitlines()[0]
        ok(f"ffmpeg found: {version_line}")
        return True

    fail("ffmpeg not found — Whisper cannot decode audio without it.")
    system = platform.system()
    if system == "Windows":
        info("Install ffmpeg on Windows:")
        info("  1. Download from: https://www.gyan.dev/ffmpeg/builds/")
        info("     → Choose 'ffmpeg-release-essentials.zip'")
        info("  2. Extract and add the 'bin' folder to your PATH")
        info("  3. Restart your terminal and re-run this script")
    elif system == "Darwin":
        info("Install ffmpeg on macOS:")
        info("  brew install ffmpeg")
    else:
        info("Install ffmpeg on Linux:")
        info("  sudo apt-get update && sudo apt-get install -y ffmpeg")
        info("  (or: sudo yum install ffmpeg / sudo pacman -S ffmpeg)")

    print()
    choice = input("  Attempt automatic install now? [y/N]: ").strip().lower()
    if choice == "y":
        if system == "Darwin":
            subprocess.run(["brew", "install", "ffmpeg"])
        elif system == "Linux":
            subprocess.run(["sudo", "apt-get", "install", "-y", "ffmpeg"])
        else:
            warn("Automatic install not supported on Windows. Please install manually.")
            return False
        # Re-check
        r2 = subprocess.run(["ffmpeg", "-version"], capture_output=True)
        if r2.returncode == 0:
            ok("ffmpeg installed successfully!")
            return True
        else:
            fail("ffmpeg install failed. Please install manually and retry.")
            return False
    return False


# ── 2. openai-whisper ─────────────────────────────────────────────────────────
def install_whisper():
    print(f"\n{BOLD}[2/4] Installing openai-whisper{RESET}")
    try:
        import whisper
        ok(f"openai-whisper already installed")
        return True
    except ImportError:
        pass

    info("Running: pip install openai-whisper")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "openai-whisper"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        ok("openai-whisper installed successfully")
        return True
    else:
        fail("pip install failed:")
        print(result.stderr[-500:])
        return False


# ── 3. Download Whisper model ─────────────────────────────────────────────────
def download_whisper_model(model_name="base"):
    print(f"\n{BOLD}[3/4] Downloading Whisper '{model_name}' model{RESET}")
    info(f"Model sizes: tiny≈75MB  base≈150MB  small≈500MB  medium≈1.5GB  large≈3GB")
    info(f"Using '{model_name}' — best speed/accuracy balance for interviews")
    try:
        import whisper
        info("Downloading model (this may take a minute on first run)...")
        model = whisper.load_model(model_name)
        ok(f"Whisper '{model_name}' model ready")
        return True
    except Exception as e:
        fail(f"Model download failed: {e}")
        return False


# ── 4. Ollama / llama3 ────────────────────────────────────────────────────────
def check_ollama():
    print(f"\n{BOLD}[4/4] Checking Ollama + llama3{RESET}")

    # Is Ollama running?
    try:
        req = urllib.request.Request("http://localhost:11434/api/tags")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        fail(f"Ollama is not running or not installed: {e}")
        info("Install Ollama from: https://ollama.com/download")
        info("Then start it:  ollama serve")
        info("Then pull the model:  ollama pull llama3")
        return False

    # Is llama3 pulled?
    models = [m.get("name", "") for m in data.get("models", [])]
    llama3_present = any("llama3" in m for m in models)

    if llama3_present:
        ok(f"Ollama running, llama3 found: {[m for m in models if 'llama3' in m]}")
        return True
    else:
        warn(f"Ollama running but llama3 not found. Available: {models or ['none']}")
        info("Pull llama3 with:  ollama pull llama3")
        info("(This downloads ~4.7GB — run in a separate terminal)")

        choice = input("\n  Attempt 'ollama pull llama3' now? [y/N]: ").strip().lower()
        if choice == "y":
            print("  Pulling llama3 (this may take several minutes)...")
            result = subprocess.run(["ollama", "pull", "llama3"])
            if result.returncode == 0:
                ok("llama3 pulled successfully!")
                return True
            else:
                fail("Pull failed. Run manually: ollama pull llama3")
        return False


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print(f"\n{BOLD}{CYAN}InterviewAI — ASR + LLM Setup{RESET}")
    print("=" * 50)

    ffmpeg_ok   = check_ffmpeg()
    whisper_ok  = install_whisper()
    model_ok    = download_whisper_model("base") if whisper_ok else False
    ollama_ok   = check_ollama()

    print(f"\n{BOLD}Setup Summary{RESET}")
    print("=" * 50)
    (ok if ffmpeg_ok  else fail)(f"ffmpeg             {'ready' if ffmpeg_ok  else 'MISSING — install manually'}")
    (ok if whisper_ok else fail)(f"openai-whisper     {'ready' if whisper_ok else 'NOT installed'}")
    (ok if model_ok   else warn)(f"Whisper base model {'ready' if model_ok   else 'not downloaded'}")
    (ok if ollama_ok  else warn)(f"Ollama + llama3    {'ready' if ollama_ok  else 'not available (fallback bank will be used)'}")

    print()
    if ffmpeg_ok and whisper_ok and model_ok:
        print(f"{GREEN}{BOLD}✓ Transcription pipeline is fully operational!{RESET}")
        print("  Content relevance (NLP score) will now show on your results page.")
    else:
        print(f"{RED}{BOLD}✗ Transcription pipeline needs attention (see above).{RESET}")

    if not ollama_ok:
        print(f"\n{YELLOW}Note:{RESET} Ollama/llama3 is optional.")
        print("  Without it, interview questions come from the curated fallback bank.")
        print("  Install Ollama and pull llama3 for AI-generated, role-specific questions.")

    print()


if __name__ == "__main__":
    main()
