from datetime import datetime

from flask import Blueprint, request, jsonify

from extensions import db
from models.session_model import InterviewSession
from models.response_model import Response
from routes.auth_routes import verify_token
from services.facial_service import facial_service
from services.speech_service import speech_service
from services.transcription_service import transcription_service
from services.nlp_service import nlp_service
from services.scoring_service import scoring_service
from utils.video_utils import save_uploaded_video
from utils.audio_utils import save_uploaded_audio

interview_bp = Blueprint("interview", __name__)


def _get_user_id_from_header():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    return verify_token(token)


@interview_bp.post("/start")
def start_interview():
    user_id = _get_user_id_from_header()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    payload = request.get_json() or {}
    position = payload.get("position", "Software Engineer")

    session = InterviewSession(user_id=user_id, position=position)
    db.session.add(session)
    db.session.commit()

    return (
        jsonify(
            {
                "session_id": str(session.id),
                "position": session.position,
                "started_at": session.started_at.isoformat(),
            }
        ),
        201,
    )


@interview_bp.post("/submit")
def submit_interview():
    user_id = _get_user_id_from_header()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    session_id = request.form.get("session_id")
    question = request.form.get("question", "Tell me about yourself.")

    if not session_id:
        return jsonify({"message": "Missing session_id"}), 400

    session = InterviewSession.query.get(session_id)
    if not session:
        return jsonify({"message": "Session not found"}), 404

    video_file = request.files.get("video")
    audio_file = request.files.get("audio")

    if not video_file or not audio_file:
        return jsonify({"message": "Missing video or audio"}), 400

    video_path = save_uploaded_video(video_file, "uploads/videos")
    audio_path = save_uploaded_audio(audio_file, "uploads/audios")

    # Run ML pipeline (stubbed)
    facial_result = facial_service.analyze_video(video_path)
    speech_result = speech_service.analyze_audio(audio_path)
    transcript_result = transcription_service.transcribe(audio_path)
    nlp_result = nlp_service.score_relevance(question, transcript_result["transcript"])

    scores = scoring_service.compute_final_score(
        facial_result["facial_score"],
        speech_result["speech_score"],
        nlp_result["nlp_score"],
    )

    response = Response(
        session_id=session.id,
        question=question,
        transcript=transcript_result["transcript"],
        facial_score=facial_result["facial_score"],
        speech_score=speech_result["speech_score"],
        nlp_score=nlp_result["nlp_score"],
        final_score=scores["final_score"],
    )
    db.session.add(response)

    # Update session overall score (simple average of responses)
    session.completed_at = datetime.utcnow()
    existing_scores = [r.final_score for r in session.responses if r.final_score]
    scores_list = existing_scores + [scores["final_score"]]
    session.overall_score = sum(scores_list) / len(scores_list)

    db.session.commit()

    return (
        jsonify(
            {
                "response_id": str(response.id),
                "session_id": str(session.id),
                "scores": {
                    "facial": response.facial_score,
                    "speech": response.speech_score,
                    "nlp": response.nlp_score,
                    "final": response.final_score,
                },
                "transcript": response.transcript,
            }
        ),
        201,
    )

