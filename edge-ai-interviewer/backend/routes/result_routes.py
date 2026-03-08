"""
Result routes — session result retrieval and per-response feedback.

Performance fixes:
- Response processing now runs in parallel via ThreadPoolExecutor.
  Previously: N responses × (NLP + report_service) ran sequentially.
  Now: all N responses processed concurrently — wall time = slowest single
  response instead of sum of all responses.
- generate_ai_feedback (phi3) is skipped at result-fetch time entirely.
  AI feedback is only generated during submit (interview_routes.py).
  The stored feedback/suggestions from DB are used directly, avoiding
  another 30-60s phi3 call on every result page load.
- nlp_service.score_relevance() still runs (fast, <50ms) but now in parallel.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Blueprint, jsonify, request

from extensions import db
from models.session_model import InterviewSession
from services.report_service import report_service
from routes.auth_routes import verify_token

result_bp = Blueprint("results", __name__)

# Thread pool sized to typical response count (3-10 questions)
_EXECUTOR = ThreadPoolExecutor(max_workers=8, thread_name_prefix="result_worker")


def _get_user_id():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    return verify_token(auth.split(" ", 1)[1])


@result_bp.route("/result/<string:session_id>", methods=["OPTIONS"])
def result_preflight(session_id):
    return "", 200


def _process_single_response(r, session_position, session_experience_level):
    """
    Process one response object — runs in a thread pool worker.
    Kept fast by: using stored scores directly, skipping phi3 re-call.
    """
    from services.nlp_service import nlp_service

    # NLP re-score is fast (<50ms) — kept for accurate key_metrics
    nlp_result = nlp_service.score_relevance(r.question or "", r.transcript or "")

    # Derive speech details from stored score (no audio re-processing)
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
            "pace":    pace,
            "clarity": clarity,
            "prosody": "Monotone" if speech_score < 0.4 else "Balanced",
        }
    }

    # Derive facial details from stored score (no video re-processing)
    facial_score = r.facial_score or 0.0
    derived_facial_details = {
        "facial_score": facial_score,
        "metrics": {
            "eye_contact": (
                "High"              if facial_score >= 0.75
                else "Good"         if facial_score >= 0.55
                else "Needs Improvement"
            ),
            "posture": (
                "Stable"   if facial_score >= 0.75
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

    # Use rules-based report only (skip phi3 — already ran during submit)
    # Pass skip_ai=True via scores sentinel so report_service won't call phi3
    report = report_service.generate_feedback(
        {
            "facial": r.facial_score,
            "speech": r.speech_score,
            "nlp":    r.nlp_score,
            "final":  r.final_score,
        },
        r.transcript or "",
        speech_details=derived_speech_details,
        nlp_details=nlp_result,
        role=session_position,
        level=session_experience_level,
        question=r.question or "",
        facial_details=derived_facial_details,
        skip_ai=True,   # never re-call phi3 on result fetch
    )

    key_metrics = report["key_metrics"]
    key_metrics["verdict"] = report.get("verdict", "")

    # Use stored feedback/suggestions from DB if available
    # (set during submit by interview_routes.py — faster and consistent)
    feedback    = r.feedback    if hasattr(r, "feedback")    and r.feedback    else report["overall_feedback"]
    suggestions = r.suggestions if hasattr(r, "suggestions") and r.suggestions else report["suggestions"]

    return {
        "id":           str(r.id),
        "question":     r.question,
        "transcript":   r.transcript,
        "facial_score": r.facial_score,
        "speech_score": r.speech_score,
        "nlp_score":    r.nlp_score,
        "final_score":  r.final_score,
        "created_at":   r.created_at.isoformat() if r.created_at else None,
        "feedback":     feedback,
        "verdict":      report.get("verdict"),
        "suggestions":  suggestions,
        "metrics":      key_metrics,
    }


@result_bp.get("/result/<string:session_id>")
def get_result(session_id):
    user_id = _get_user_id()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    session = db.session.get(InterviewSession, str(session_id))
    if not session:
        return jsonify({"message": "Session not found"}), 404

    responses = list(session.responses)

    if not responses:
        return jsonify({
            "session_id":    str(session.id),
            "user_id":       str(session.user_id),
            "position":      session.position,
            "started_at":    session.started_at.isoformat(),
            "completed_at":  session.completed_at.isoformat() if session.completed_at else None,
            "overall_score": session.overall_score,
            "responses":     [],
            "session_summary": {"executive_summary": "No responses recorded.", "overall_verdict": "N/A"},
        }), 200

    # ── Parallel processing — all responses processed concurrently ────────────
    futures = {
        _EXECUTOR.submit(
            _process_single_response, r,
            session.position, session.experience_level
        ): r.created_at
        for r in responses
    }

    results_unsorted = []
    for future in as_completed(futures):
        try:
            results_unsorted.append((futures[future], future.result()))
        except Exception as exc:
            # One response failed — include a minimal error entry rather than
            # failing the entire result page
            results_unsorted.append((None, {
                "error": str(exc),
                "feedback": "Analysis error for this response.",
                "suggestions": [],
                "metrics": {},
            }))

    # Re-sort by original created_at order
    results_unsorted.sort(key=lambda x: x[0] or "")
    responses_data = [item for _, item in results_unsorted]

    session_summary = report_service.aggregate_session_report(responses_data)

    return jsonify({
        "session_id":    str(session.id),
        "user_id":       str(session.user_id),
        "position":      session.position,
        "started_at":    session.started_at.isoformat(),
        "completed_at":  session.completed_at.isoformat() if session.completed_at else None,
        "overall_score": session.overall_score,
        "responses":     responses_data,
        "session_summary": session_summary,
    }), 200