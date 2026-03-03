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
        
        # Generate feedback on the fly
        report = report_service.generate_feedback(
            {"facial": r.facial_score, "speech": r.speech_score, "nlp": r.nlp_score, "final": r.final_score},
            r.transcript or "",
            nlp_details=nlp_result
        )
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
                "metrics": report["key_metrics"]
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
