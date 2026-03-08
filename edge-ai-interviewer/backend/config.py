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


class Config:
    """Base configuration shared across all environments."""

    SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-in-prod")

    # Database — defaults to local SQLite, override with DATABASE_URL for Postgres
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "sqlite:///edge_ai_interviewer.db",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=4)

    # CORS
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173")

    # FIX: Limit upload size to 500 MB to prevent memory exhaustion from
    # large video uploads. Flask returns 413 if exceeded.
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 500 * 1024 * 1024))

    # Upload directory (used by save_uploaded_video/audio helpers)
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads")

    # Logging
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

    # FIX: Secure cookie settings — prevents session cookies being sent
    # over plain HTTP in production and blocks JS access to the cookie.
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # Security headers — applied by app.py's after_request hook
    SECURITY_HEADERS = {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "X-XSS-Protection": "1; mode=block",
        # FIX: Relaxed CSP — original blocked all inline scripts which breaks
        # Vite HMR and React dev tools. Tightened further in ProdConfig.
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


class DevConfig(Config):
    DEBUG = True
    SESSION_COOKIE_SECURE = False   # Allow cookies over HTTP in local dev

    # Even more relaxed CSP for Vite HMR websocket and eval() used by source maps
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
    SESSION_COOKIE_SECURE = True    # Require HTTPS for cookies in production

    # Strict CSP for production — no inline scripts, no eval
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