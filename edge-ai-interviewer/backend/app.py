"""
Flask application factory.
ffmpeg is auto-injected into PATH at startup (Windows) so Whisper works
every time you run `python app.py` — no manual steps needed.
"""

import os
import sys
import subprocess
import logging
from pathlib import Path
from flask import Flask, request, jsonify


# ── Auto-inject ffmpeg on Windows — inline, no external module needed ────────
def _ensure_ffmpeg():
    if sys.platform != "win32":
        return  # Linux/macOS: nothing to do

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

    # Check known locations
    for d in search_dirs:
        if (Path(d) / "ffmpeg.exe").exists():
            os.environ["PATH"] = d + ";" + os.environ.get("PATH", "")
            if _callable():
                logging.info(f"[ffmpeg] Auto-injected from: {d}")
                return

    # Glob search under common roots
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
        "[ffmpeg] Not found on this machine. "
        "Run: python utils/fix_ffmpeg.py  to download and install it. "
        "Whisper transcription will not work until ffmpeg is installed."
    )

_ensure_ffmpeg()
# ─────────────────────────────────────────────────────────────────────────────

from config import get_config
from extensions import init_extensions, db
from utils.logger import setup_logging
from utils.error_handlers import register_error_handlers


def create_app():
    app = Flask(__name__)
    app.config.from_object(get_config())

    setup_logging(app)
    init_extensions(app)
    register_error_handlers(app)

    from models.user_model import User                    # noqa: F401
    from models.session_model import InterviewSession     # noqa: F401
    from models.response_model import Response            # noqa: F401

    from routes.auth_routes import auth_bp
    from routes.interview_routes import interview_bp
    from routes.result_routes import result_bp

    app.register_blueprint(auth_bp,      url_prefix="/api/auth")
    app.register_blueprint(interview_bp, url_prefix="/api/interview")
    app.register_blueprint(result_bp,    url_prefix="/api")

    @app.route("/api/health", methods=["GET", "OPTIONS"])
    def health_check():
        return jsonify({"status": "ok"})

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

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)