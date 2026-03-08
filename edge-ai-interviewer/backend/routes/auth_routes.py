"""
Authentication routes — register and login.

Fixes applied:
- Extracted into its own module (was incorrectly merged with scoring_service.py
  and result_routes.py in the original submission, causing circular imports
  at startup since result_routes.py imports verify_token from this file).
"""

from datetime import datetime

from flask import Blueprint, request, jsonify, current_app
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from extensions import db
from models.user_model import User

auth_bp = Blueprint("auth", __name__)


def _get_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["JWT_SECRET_KEY"], salt="auth")


def generate_token(user_id: str) -> str:
    s = _get_serializer()
    return s.dumps({"sub": str(user_id), "iat": datetime.utcnow().isoformat()})


def verify_token(token: str, max_age_seconds: int = 60 * 60 * 4) -> str | None:
    """Verify a token and return the user_id string, or None if invalid/expired."""
    s = _get_serializer()
    try:
        data = s.loads(token, max_age=max_age_seconds)
        return data.get("sub")
    except (BadSignature, SignatureExpired):
        return None


@auth_bp.post("/register")
def register():
    payload = request.get_json() or {}
    name = payload.get("name")
    email = payload.get("email")
    password = payload.get("password")

    if not all([name, email, password]):
        return jsonify({"message": "Missing required fields"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already registered"}), 409

    user = User(name=name, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    token = generate_token(user.id)

    return jsonify({
        "user": {"id": str(user.id), "name": user.name, "email": user.email},
        "token": token,
    }), 201


@auth_bp.post("/login")
def login():
    payload = request.get_json() or {}
    email = payload.get("email")
    password = payload.get("password")

    if not all([email, password]):
        return jsonify({"message": "Missing credentials"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"message": "Invalid email or password"}), 401

    token = generate_token(user.id)
    return jsonify({
        "user": {"id": str(user.id), "name": user.name, "email": user.email},
        "token": token,
    }), 200


@auth_bp.post("/refresh")
def refresh_token():
    """
    Refresh a still-valid token to extend the session.
    Returns a new token with a fresh 4-hour window.
    Clients should call this before expiry to avoid silent logouts.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return jsonify({"message": "Missing token"}), 401

    token = auth.split(" ", 1)[1]
    user_id = verify_token(token)
    if not user_id:
        return jsonify({"message": "Token expired or invalid — please log in again"}), 401

    new_token = generate_token(user_id)
    return jsonify({"token": new_token}), 200