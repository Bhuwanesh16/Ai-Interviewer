"""
Application configuration.

Fixes applied:
- Content-Security-Policy header was too restrictive for this app:
    script-src 'self' blocks all inline scripts and eval(), which breaks
    Vite's dev HMR and any inline <script> tags used by the frontend.
    Replaced with a sane default that can be tightened per-environment.
- Added UPLOAD_FOLDER and MAX_CONTENT_LENGTH to prevent unbounded file
  uploads (default Flask has no size limit — a 2 GB video upload would
  exhaust memory).
- Added SESSION_COOKIE_* settings so the auth cookie is not sent over
  plain HTTP in production.
- ProdConfig overrides the CSP to be strict; DevConfig relaxes it for
  local development with Vite HMR.
"""

import os
from datetime import timedelta


BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-in-prod")

    # Database — now located under backend/data by default
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{os.path.join(BASE_DIR, 'data', 'edge_ai_interviewer.db')}",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=4)

    # CORS
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173")

    # Limit upload size (default 500 MB)
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 500 * 1024 * 1024))

    # Upload folders — split video/audio
    UPLOAD_FOLDER_VIDEO = os.getenv("UPLOAD_FOLDER_VIDEO", os.path.join(BASE_DIR, 'storage', 'videos'))
    UPLOAD_FOLDER_AUDIO = os.getenv("UPLOAD_FOLDER_AUDIO", os.path.join(BASE_DIR, 'storage', 'audios'))

    # Logging
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

    # Security / cookies
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    SECURITY_HEADERS = {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "X-XSS-Protection": "1; mode=block",
        "Content-Security-Policy": (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "media-src 'self' blob:; "
            "connect-src 'self'; "
            "object-src 'none';"
        ),
    }

    @staticmethod
    def init_app(app):
        # Ensure storage folders exist at startup
        os.makedirs(Config.UPLOAD_FOLDER_VIDEO, exist_ok=True)
        os.makedirs(Config.UPLOAD_FOLDER_AUDIO, exist_ok=True)

        # Ensure data and logs directories exist so SQLite can create the DB file
        data_dir = os.path.join(BASE_DIR, 'data')
        logs_dir = os.path.join(BASE_DIR, 'logs')
        os.makedirs(data_dir, exist_ok=True)
        os.makedirs(logs_dir, exist_ok=True)


class DevConfig(Config):
    DEBUG = True
    SESSION_COOKIE_SECURE = False
    SECURITY_HEADERS = {
        **Config.SECURITY_HEADERS,
        "Content-Security-Policy": (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src * data: blob:; "
            "media-src 'self' blob:; "
            "connect-src 'self' ws: wss:; "
            "object-src 'none';"
        ),
    }


class ProdConfig(Config):
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    SECURITY_HEADERS = {
        **Config.SECURITY_HEADERS,
        "Content-Security-Policy": (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "media-src 'self' blob:; "
            "connect-src 'self'; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        ),
    }


config_by_name = {
    "development": DevConfig,
    "production": ProdConfig,
}


def get_config():
    env = os.getenv("FLASK_ENV", "development")
    return config_by_name.get(env, DevConfig)