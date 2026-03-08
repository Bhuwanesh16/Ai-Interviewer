"""
User model.

Fixes applied:
- Added cascade="all, delete-orphan" to sessions relationship (mirrors the
  fix in session_model.py — deleting a user now correctly removes all their
  sessions and, by cascade, all their responses).
- Added __repr__ for easier debugging.
- password_hash column length increased from Text to String(512): some
  hashing algorithms (e.g. argon2 via werkzeug) can produce hashes longer
  than the default SQLite TEXT affinity, and explicit length avoids
  truncation on strict databases like MySQL/MariaDB.
"""

import uuid
from datetime import datetime

from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db


def _uuid_str() -> str:
    return str(uuid.uuid4())


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=_uuid_str)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    # FIX: use String(512) instead of Text so strict engines (MySQL) don't
    # truncate long argon2/bcrypt hashes silently.
    password_hash = db.Column(db.String(512), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # FIX: cascade so deleting a user also removes all their sessions/responses
    sessions = db.relationship(
        "InterviewSession",
        back_populates="user",
        lazy=True,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"