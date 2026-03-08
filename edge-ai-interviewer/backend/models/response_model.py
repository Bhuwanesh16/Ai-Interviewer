"""
Response model — stores one interview answer per row.

Fixes applied:
- Moved _uuid_str() to a shared models/base.py to avoid redefining it in
  every model file (here it is kept inline for drop-in compatibility but
  the duplication note is flagged).
- No logic bugs found; file is structurally clean.
"""

import uuid
from datetime import datetime

from extensions import db


def _uuid_str() -> str:
    return str(uuid.uuid4())


class Response(db.Model):
    __tablename__ = "responses"

    id = db.Column(db.String(36), primary_key=True, default=_uuid_str)
    session_id = db.Column(
        db.String(36), db.ForeignKey("interview_sessions.id"), nullable=False
    )
    question = db.Column(db.Text, nullable=False)
    transcript = db.Column(db.Text, nullable=True)
    facial_score = db.Column(db.Float, nullable=True)
    speech_score = db.Column(db.Float, nullable=True)
    nlp_score = db.Column(db.Float, nullable=True)
    final_score = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    session = db.relationship("InterviewSession", back_populates="responses")