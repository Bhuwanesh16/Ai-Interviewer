"""
Authentication routes — register and login.

Fix applied:
- request.get_json(force=True, silent=True) so Flask parses the body
  regardless of Content-Type header (fixes 400 when header is missing/wrong).
- Individual field validation with specific error messages.
- Password minimum length check (6 chars).
"""

from datetime import datetime
import logging

from flask import Blueprint, request, jsonify, current_app
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from extensions import db
from models.user_model import User

auth_bp = Blueprint("auth", __name__)
logger  = logging.getLogger(__name__)


def _get_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["JWT_SECRET_KEY"], salt="auth")


def generate_token(user_id: str) -> str:
    s = _get_serializer()
    return s.dumps({"sub": str(user_id), "iat": datetime.utcnow().isoformat()})


def verify_token(token: str, max_age_seconds: int = 60 * 60 * 4) -> str | None:
    s = _get_serializer()
    try:
        data = s.loads(token, max_age=max_age_seconds)
        return data.get("sub")
    except (BadSignature, SignatureExpired):
        return None


@auth_bp.post("/register")
def register():
    payload  = request.get_json(force=True, silent=True) or {}
    name     = (payload.get("name") or "").strip()
    email    = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not name:
        return jsonify({"message": "Name is required"}), 400
    if not email:
        return jsonify({"message": "Email is required"}), 400
    if "@" not in email:
        return jsonify({"message": "Invalid email address"}), 400
    if not password:
        return jsonify({"message": "Password is required"}), 400
    if len(password) < 6:
        return jsonify({"message": "Password must be at least 6 characters"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "Email already registered"}), 409

    user = User(name=name, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    token = generate_token(user.id)
    logger.info(f"[register] new user: {email}")

    return jsonify({
        "user":  {"id": str(user.id), "name": user.name, "email": user.email},
        "token": token,
    }), 201


@auth_bp.post("/login")
def login():
    payload  = request.get_json(force=True, silent=True) or {}
    email    = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not email or not password:
        return jsonify({"message": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"message": "Invalid email or password"}), 401

    token = generate_token(user.id)
    logger.info(f"[login] authenticated: {email}")

    return jsonify({
        "user":  {"id": str(user.id), "name": user.name, "email": user.email},
        "token": token,
    }), 200


@auth_bp.post("/refresh")
def refresh_token():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return jsonify({"message": "Missing token"}), 401

    token   = auth.split(" ", 1)[1]
    user_id = verify_token(token)
    if not user_id:
        return jsonify({"message": "Token expired or invalid — please log in again"}), 401

    new_token = generate_token(user_id)
    return jsonify({"token": new_token}), 200