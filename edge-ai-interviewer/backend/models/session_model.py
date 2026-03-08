"""
InterviewSession model.

Fixes applied:
- Added cascade="all, delete-orphan" to the responses relationship so
  deleting a session also removes its child Response rows (previously
  orphaned rows would remain in the DB and cause FK constraint errors
  on databases that enforce them, e.g. PostgreSQL).
- Added __repr__ for easier debugging in shell/logs.
"""

import uuid
from datetime import datetime

from extensions import db


def _uuid_str() -> str:
    return str(uuid.uuid4())


class InterviewSession(db.Model):
    __tablename__ = "interview_sessions"

    id = db.Column(db.String(36), primary_key=True, default=_uuid_str)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    position = db.Column(db.String(255), nullable=False)
    skills = db.Column(db.Text, nullable=True)
    experience_level = db.Column(db.String(50), nullable=True, default="Intermediate")
    started_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=True)
    overall_score = db.Column(db.Float, nullable=True)

    user = db.relationship("User", back_populates="sessions")

    # FIX: Added cascade + passive_deletes so removing a session also removes
    # its responses. Without this, PostgreSQL raises an IntegrityError on DELETE
    # and SQLite silently leaves orphaned rows.
    responses = db.relationship(
        "Response",
        back_populates="session",
        lazy=True,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<InterviewSession id={self.id} position={self.position!r}>"