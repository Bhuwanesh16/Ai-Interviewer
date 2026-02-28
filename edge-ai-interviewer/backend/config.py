import os
from datetime import timedelta


class Config:
    """Base configuration for Flask app."""

    SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-in-prod")

    # Database: default to local SQLite file, override with DATABASE_URL if needed
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "sqlite:///edge_ai_interviewer.db",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT (simple implementation using timed serializer or Flask-JWT-Extended if added later)
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=4)

    # CORS
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173")


class DevConfig(Config):
    DEBUG = True


class ProdConfig(Config):
    DEBUG = False


config_by_name = {
    "development": DevConfig,
    "production": ProdConfig,
}


def get_config():
    env = os.getenv("FLASK_ENV", "development")
    return config_by_name.get(env, DevConfig)

