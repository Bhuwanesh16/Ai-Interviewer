from flask import Blueprint, jsonify

from models.session_model import InterviewSession
from services.report_service import report_service

result_bp = Blueprint("results", __name__)


@result_bp.get("/result/<uuid:session_id>")
def get_result(session_id):
    session = InterviewSession.query.get(session_id)
    if not session:
        return jsonify({"message": "Session not found"}), 404

    from services.nlp_service import nlp_service

    responses_data = []
    for r in session.responses:
        # Re-run NLP relevance for industrial validation details
        nlp_result = nlp_service.score_relevance(r.question or "", r.transcript or "")

        # Re-derive speech details from stored score so pace/clarity are real values
        speech_score = r.speech_score or 0.0
        if speech_score >= 0.75:
            pace = "Optimal"
            clarity = "High"
        elif speech_score >= 0.5:
            pace = "Moderate"
            clarity = "Moderate"
        elif speech_score > 0:
            pace = "Fast"
            clarity = "Low Quality"
        else:
            pace = "Unknown"
            clarity = "Unknown"

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

        responses_data.append(
            {
                "id": str(r.id),
                "question": r.question,
                "transcript": r.transcript,
                "facial_score": r.facial_score,
                "speech_score": r.speech_score,
                "nlp_score": r.nlp_score,
                "final_score": r.final_score,
                "created_at": r.created_at.isoformat(),
                "feedback": report["overall_feedback"],
                "verdict": report.get("verdict"),
                "suggestions": report["suggestions"],
                "metrics": key_metrics,
            }
        )

    return (
        jsonify(
            {
                "session_id": str(session.id),
                "user_id": str(session.user_id),
                "position": session.position,
                "started_at": session.started_at.isoformat(),
                "completed_at": session.completed_at.isoformat()
                if session.completed_at
                else None,
                "overall_score": session.overall_score,
                "responses": responses_data,
            }
        ),
        200,
    )
