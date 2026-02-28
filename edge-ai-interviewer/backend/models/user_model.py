import uuid
from datetime import datetime

from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db


def _uuid_str() -> str:
  return str(uuid.uuid4())


class User(db.Model):
    __tablename__ = "users"

    # Use simple string-based UUIDs so the model works with SQLite and Postgres.
    id = db.Column(db.String(36), primary_key=True, default=_uuid_str)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    sessions = db.relationship("InterviewSession", back_populates="user", lazy=True)

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

