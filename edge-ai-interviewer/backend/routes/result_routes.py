"""
Result routes — session result retrieval and per-response feedback.

Blueprint is registered at url_prefix="/api" in app.py.
Route decorator: @result_bp.get("/result/<session_id>")
→ Full URL: GET /api/result/<session_id>

Fixes applied:
- Added explicit OPTIONS handler for /result/<session_id> so CORS preflight
  on this endpoint never returns 405.
- InterviewSession.query.get() replaced with db.session.get() (SQLAlchemy 2.x).
- facial_details derived from stored facial_score so eye_contact/posture
  are never "N/A" on the results page.
"""

from flask import Blueprint, jsonify, request

from extensions import db
from models.session_model import InterviewSession
from services.report_service import report_service
from routes.auth_routes import verify_token

result_bp = Blueprint("results", __name__)


def _get_user_id():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    return verify_token(auth.split(" ", 1)[1])


# FIX: Explicit OPTIONS handler so CORS preflight on this route returns 200
@result_bp.route("/result/<string:session_id>", methods=["OPTIONS"])
def result_preflight(session_id):
    return "", 200


@result_bp.get("/result/<string:session_id>")
def get_result(session_id):
    user_id = _get_user_id()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    session = db.session.get(InterviewSession, str(session_id))
    if not session:
        return jsonify({"message": "Session not found"}), 404

    from services.nlp_service import nlp_service

    responses_data_for_output = []
    responses_data_for_aggregation = []

    for r in session.responses:
        nlp_result = nlp_service.score_relevance(r.question or "", r.transcript or "")

        # Re-derive speech details from stored score
        speech_score = r.speech_score or 0.0
        if speech_score >= 0.75:
            pace, clarity = "Optimal", "High"
        elif speech_score >= 0.5:
            pace, clarity = "Moderate", "Moderate"
        elif speech_score > 0:
            pace, clarity = "Fast", "Low Quality"
        else:
            pace, clarity = "Unknown", "Unknown"

        derived_speech_details = {
            "speech_score": speech_score,
            "metrics": {
                "pace": pace,
                "clarity": clarity,
                "prosody": "Monotone" if speech_score < 0.4 else "Balanced",
            }
        }

        # Derive facial_details from stored facial_score
        facial_score = r.facial_score or 0.0
        derived_facial_details = {
            "facial_score": facial_score,
            "metrics": {
                "eye_contact": (
                    "High" if facial_score >= 0.75
                    else "Good" if facial_score >= 0.55
                    else "Needs Improvement"
                ),
                "posture": (
                    "Stable" if facial_score >= 0.75
                    else "Average" if facial_score >= 0.45
                    else "Restless"
                ),
                "engagement": (
                    "Enthusiastic" if facial_score >= 0.75
                    else "Professional" if facial_score >= 0.45
                    else "Reserved"
                ),
                "presence": f"{round(facial_score * 100)}%",
            }
        }

        report = report_service.generate_feedback(
            {
                "facial": r.facial_score,
                "speech": r.speech_score,
                "nlp": r.nlp_score,
                "final": r.final_score,
            },
            r.transcript or "",
            speech_details=derived_speech_details,
            nlp_details=nlp_result,
            role=session.position,
            level=session.experience_level,
            question=r.question or "",
            facial_details=derived_facial_details,
        )

        key_metrics = report["key_metrics"]
        key_metrics["verdict"] = report.get("verdict", "")

        res_item = {
            "id": str(r.id),
            "question": r.question,
            "transcript": r.transcript,
            "facial_score": r.facial_score,
            "speech_score": r.speech_score,
            "nlp_score": r.nlp_score,
            "final_score": r.final_score,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "feedback": report["overall_feedback"],
            "verdict": report.get("verdict"),
            "suggestions": report["suggestions"],
            "metrics": key_metrics,
        }
        responses_data_for_output.append(res_item)
        responses_data_for_aggregation.append(res_item)

    session_summary = report_service.aggregate_session_report(responses_data_for_aggregation)

    return jsonify({
        "session_id": str(session.id),
        "user_id": str(session.user_id),
        "position": session.position,
        "started_at": session.started_at.isoformat(),
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "overall_score": session.overall_score,
        "responses": responses_data_for_output,
        "session_summary": session_summary,
    }), 200