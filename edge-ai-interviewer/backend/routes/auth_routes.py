from datetime import datetime

from flask import Blueprint, request, jsonify, current_app
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from extensions import db
from models.user_model import User

auth_bp = Blueprint("auth", __name__)


def _get_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["JWT_SECRET_KEY"], salt="auth")


def generate_token(user_id):
    s = _get_serializer()
    return s.dumps({"sub": str(user_id), "iat": datetime.utcnow().isoformat()})


def verify_token(token, max_age_seconds=60 * 60 * 4):
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

    return (
        jsonify(
            {
                "user": {"id": str(user.id), "name": user.name, "email": user.email},
                "token": token,
            }
        ),
        201,
    )


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
    return (
        jsonify(
            {
                "user": {"id": str(user.id), "name": user.name, "email": user.email},
                "token": token,
            }
        ),
        200,
    )

