"""
Flask application factory.
ffmpeg is auto-injected into PATH at startup (Windows) so Whisper works
every time you run `python app.py` — no manual steps needed.

Performance fixes:
- phi3 pre-warm thread: loads model into RAM at startup so first user
  request doesn't wait 40s for model to load.
- /api/health returns a cache-control header so browser doesn't need to
  hit the server on every poll (pairs with Interview.jsx fix).
"""

import os
import sys
import subprocess
import logging
import threading
import time
from pathlib import Path
from flask import Flask, request, jsonify


# ── Auto-inject ffmpeg on Windows ─────────────────────────────────────────────
def _ensure_ffmpeg():
    if sys.platform != "win32":
        return

    def _callable():
        try:
            return subprocess.run(
                ["ffmpeg", "-version"], capture_output=True, timeout=10
            ).returncode == 0
        except (FileNotFoundError, OSError):
            return False

    if _callable():
        logging.info("[ffmpeg] Already in PATH")
        return

    search_dirs = [
        r"C:\ffmpeg\bin",
        r"C:\Program Files\ffmpeg\bin",
        r"C:\Program Files (x86)\ffmpeg\bin",
        r"C:\tools\ffmpeg\bin",
        str(Path.home() / "ffmpeg" / "bin"),
        str(Path.home() / "Downloads" / "ffmpeg" / "bin"),
        r"C:\ProgramData\chocolatey\bin",
        str(Path.home() / "scoop" / "apps" / "ffmpeg" / "current" / "bin"),
    ]

    for d in search_dirs:
        if (Path(d) / "ffmpeg.exe").exists():
            os.environ["PATH"] = d + ";" + os.environ.get("PATH", "")
            if _callable():
                logging.info(f"[ffmpeg] Auto-injected from: {d}")
                return

    for root in [Path("C:/ffmpeg"), Path("C:/tools"), Path.home() / "ffmpeg"]:
        if not root.exists():
            continue
        for hit in root.rglob("ffmpeg.exe"):
            d = str(hit.parent)
            os.environ["PATH"] = d + ";" + os.environ.get("PATH", "")
            if _callable():
                logging.info(f"[ffmpeg] Auto-injected from: {d}")
                return

    logging.warning(
        "[ffmpeg] Not found. Run: python utils/fix_ffmpeg.py to install it."
    )

_ensure_ffmpeg()
# ─────────────────────────────────────────────────────────────────────────────

from config import get_config
from extensions import init_extensions, db
from utils.logger import setup_logging
from utils.error_handlers import register_error_handlers


# ── phi3 pre-warm — runs once in background after Flask starts ────────────────
def _prewarm_phi3():
    """
    Send a minimal request to Ollama so phi3 loads its weights into RAM.
    This means the first real user request takes ~2s instead of ~40s.
    Runs in a daemon thread so it never blocks startup.
    """
    time.sleep(4)  # wait for Flask to finish initialising
    try:
        import requests as req
        ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        resp = req.post(
            f"{ollama_url}/api/generate",
            json={
                "model": os.environ.get("OLLAMA_MODEL", "phi3"),
                "prompt": "Hello",
                "stream": False,
                "options": {"num_predict": 1},
            },
            timeout=90,
        )
        if resp.status_code == 200:
            logging.info("[prewarm] phi3 loaded into RAM ✓ — first request will be fast")
        else:
            logging.warning(f"[prewarm] phi3 responded with status {resp.status_code}")
    except Exception as exc:
        logging.warning(f"[prewarm] phi3 pre-warm failed (Ollama may not be running): {exc}")
# ─────────────────────────────────────────────────────────────────────────────


def create_app():
    app = Flask(__name__)
    cfg = get_config()
    app.config.from_object(cfg)

    # Run config init tasks (create data/storage/logs dirs) before
    # initializing extensions so the DB file can be created.
    try:
        cfg.init_app(app)
    except Exception:
        # Be forgiving: if init_app has side-effects that fail in some
        # environments, continue and let later failures surface.
        pass

    setup_logging(app)
    init_extensions(app)
    register_error_handlers(app)

    from models.user_model import User                    # noqa: F401
    from models.session_model import InterviewSession     # noqa: F401
    from models.response_model import Response            # noqa: F401

    from routes.auth_routes import auth_bp
    from routes.interview_routes import interview_bp
    from routes.result_routes import result_bp
    from routes.debug_routes import debug_bp

    app.register_blueprint(auth_bp,      url_prefix="/api/auth")
    app.register_blueprint(interview_bp, url_prefix="/api/interview")
    app.register_blueprint(result_bp,    url_prefix="/api")
    app.register_blueprint(debug_bp,     url_prefix="/api/debug")

    @app.route("/api/health", methods=["GET", "OPTIONS"])
    def health_check():
        resp = jsonify({"status": "ok"})
        # Tell the browser it can cache this response for 25 seconds.
        # Combined with the 30s poll interval in Interview.jsx, this means
        # zero redundant network requests — the browser serves from cache.
        resp.headers["Cache-Control"] = "public, max-age=25"
        return resp

    @app.route("/api/asr_status", methods=["GET", "OPTIONS"])
    def asr_status():
        try:
            from services.transcription_service import transcription_service
            return jsonify({"status": "ok", "asr": transcription_service.status()}), 200
        except Exception as exc:
            return jsonify({"status": "error", "message": str(exc)}), 200

    @app.after_request
    def add_cors_headers(response):
        allowed_origins_cfg = app.config.get("CORS_ORIGINS", "http://localhost:5173")
        if isinstance(allowed_origins_cfg, str):
            allowed_origins = [o.strip() for o in allowed_origins_cfg.split(",") if o.strip()]
        else:
            allowed_origins = list(allowed_origins_cfg)

        origin = request.headers.get("Origin", "")
        if origin and origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
        elif allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = allowed_origins[0]

        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

        if request.method == "OPTIONS":
            response.status_code = 200

        for header, value in app.config.get("SECURITY_HEADERS", {}).items():
            response.headers[header] = value

        return response

    with app.app_context():
        db.create_all()

    # Background pre-warm for heavy ML models to avoid long first-request delays
    def _prewarm_models():
        # Transcription (Whisper) — call internal loader to warm weights
        try:
            import services.transcription_service as ts
            try:
                ts._load_model()
                logging.info("[prewarm] Whisper model loaded into RAM")
            except Exception as e:
                logging.info(f"[prewarm] Whisper prewarm skipped: {e}")
        except Exception:
            logging.info("[prewarm] transcription_service import failed — skipping Whisper prewarm")

        # NLP (sentence-transformers) — import module to trigger model load
        try:
            import services.nlp_service as ns
            # The module-level `nlp_service` will attempt to load SentenceTransformer
            if getattr(ns, 'nlp_service', None) and getattr(ns.nlp_service, 'model', None):
                logging.info("[prewarm] NLP model loaded into RAM")
        except Exception as e:
            logging.info(f"[prewarm] NLP prewarm skipped: {e}")

    try:
        threading.Thread(target=_prewarm_models, daemon=True).start()
    except Exception:
        logging.warning("Could not start prewarm thread")

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("PORT", 5000))

    # Start phi3 pre-warm in background — doesn't block Flask startup
    threading.Thread(target=_prewarm_phi3, daemon=True).start()

    app.run(host="0.0.0.0", port=port, debug=True)