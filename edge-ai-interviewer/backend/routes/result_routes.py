from flask import Blueprint, jsonify, request

from models.session_model import InterviewSession
from services.report_service import report_service
from routes.auth_routes import verify_token

result_bp = Blueprint("results", __name__)


def _get_user_id():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    return verify_token(auth.split(" ", 1)[1])


@result_bp.get("/result/<string:session_id>")
def get_result(session_id):
    user_id = _get_user_id()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    session = InterviewSession.query.get(str(session_id))
    if not session:
        return jsonify({"message": "Session not found"}), 404

    from services.nlp_service import nlp_service

    responses_data_for_output = []
    responses_data_for_aggregation = []

    for r in session.responses:
        # Re-run NLP relevance for industrial validation details
        nlp_result = nlp_service.score_relevance(r.question or "", r.transcript or "")

        # Re-derive speech details from stored score so pace/clarity are real values
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

        # Generate feedback on the fly with real speech context
        report = report_service.generate_feedback(
            {"facial": r.facial_score, "speech": r.speech_score, "nlp": r.nlp_score, "final": r.final_score},
            r.transcript or "",
            speech_details=derived_speech_details,
            nlp_details=nlp_result,
            role=session.position,
            level=session.experience_level,
            question=r.question or ""
        )

        # Merge verdict into key_metrics so frontend has one source of truth
        key_metrics = report["key_metrics"]
        key_metrics["verdict"] = report.get("verdict", "")

        # Data for individual response output
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

    # Holistic session summary
    session_summary = report_service.aggregate_session_report(responses_data_for_aggregation)

    return jsonify({
        "session_id": str(session.id),
        "user_id": str(session.user_id),
        "position": session.position,
        "started_at": session.started_at.isoformat(),
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "overall_score": session.overall_score,
        "responses": responses_data_for_output,
        "session_summary": session_summary
    }), 200
