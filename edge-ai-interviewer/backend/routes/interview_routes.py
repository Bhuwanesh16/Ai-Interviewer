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
from services.report_service import report_service
from utils.video_utils import save_uploaded_video
from utils.audio_utils import save_uploaded_audio

interview_bp = Blueprint("interview", __name__)


def _get_user_id_from_header():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    return verify_token(token)


@interview_bp.post("/generate_questions")
def generate_questions():
    user_id = _get_user_id_from_header()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401
    
    payload = request.get_json() or {}
    role = payload.get("role", "Software Engineer")
    skills = payload.get("skills", "")
    level = payload.get("level", "Intermediate")
    num_q = int(payload.get("numQuestions", 3))
    
    skill_list = [s.strip() for s in skills.split(",") if s.strip()]
    
    # Base questions based on level
    if level == "Entry Level":
        pool = [f"What motivated you to start a career as a {role}?", "Describe a foundational technical project you're proud of."]
    elif "Senior" in level or "Lead" in level:
        pool = [f"How do you handle architectural trade-offs in {role} roles?", "Describe your experience mentoring junior engineers."]
    else:
        pool = [f"Can you tell me about your experience as a {role}?", "How do you stay updated with industry trends?"]

    if skill_list:
        for skill in skill_list:
            pool.append(f"How do you apply your skills in {skill} to solve real-world problems?")
            pool.append(f"Describe a project where {skill} was critical to the solution.")
    
    # Shuffle or just slice to the requested number
    import random
    random.shuffle(pool)
    questions = pool[:num_q]
    
    # Ensure at least 1 question if pool is small
    if not questions:
        questions = [f"Tell me about your approach to {role}."]
        
    return jsonify({"questions": questions}), 200


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

    # Run ML pipeline (stubbed for speech/nlp, real for edge facial)
    edge_facial_str = request.form.get("edge_facial_score")
    if edge_facial_str:
        facial_score = float(edge_facial_str)
    else:
        facial_result = facial_service.analyze_video(video_path)
        facial_score = facial_result["facial_score"]

    speech_result = speech_service.analyze_audio(audio_path)
    transcript_result = transcription_service.transcribe(audio_path)
    nlp_result = nlp_service.score_relevance(question, transcript_result["transcript"])

    scores = scoring_service.compute_final_score(
        facial_score,
        speech_result["speech_score"],
        nlp_result["nlp_score"],
    )

    response = Response(
        session_id=session.id,
        question=question,
        transcript=transcript_result["transcript"],
        facial_score=facial_score,
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

    # Generate detailed feedback
    report = report_service.generate_feedback(
        {"facial": response.facial_score, "speech": response.speech_score, "nlp": response.nlp_score, "final": response.final_score},
        response.transcript,
        speech_details=speech_result,
        nlp_details=nlp_result
    )

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
                "feedback": report["overall_feedback"],
                "verdict": report.get("verdict"),
                "suggestions": report["suggestions"],
                "metrics": report["key_metrics"]
            }
        ),
        201,
    )


@interview_bp.post("/analyze")
def analyze_chunk():
    """Analyze a short audio/video chunk and return intermediate scores.

    This endpoint is intended for real-time feedback while the user is
    recording.  The frontend will POST one-second blobs as they are
    produced by the MediaRecorder.  The implementation reuses the same
    facial/speech services as the full submission, but does not store any
    data server-side (aside from the temporary file used for inference).
    """
    user_id = _get_user_id_from_header()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    # session_id is optional here; we only need it so that the client can
    # create the session up front and we can verify it if provided.
    session_id = request.form.get("session_id")
    if session_id:
        session = InterviewSession.query.get(session_id)
        if not session:
            return jsonify({"message": "Session not found"}), 404

    video_file = request.files.get("video")
    audio_file = request.files.get("audio")
    if not video_file or not audio_file:
        return jsonify({"message": "Missing video or audio"}), 400

    # save to a temporary location (handled by helpers) and analyze
    video_path = save_uploaded_video(video_file, "uploads/videos/temp")
    audio_path = save_uploaded_audio(audio_file, "uploads/audios/temp")

    facial_result = facial_service.analyze_video(video_path)
    speech_result = speech_service.analyze_audio(audio_path)

    return jsonify({
        "facial": facial_result.get("facial_score"),
        "speech": speech_result.get("speech_score"),
    }), 200


@interview_bp.get("/history")
def get_history():
    """Return all completed interview sessions for the current user,
    sorted by most recent first, including per-session scores and feedback."""
    user_id = _get_user_id_from_header()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    sessions = (
        InterviewSession.query
        .filter_by(user_id=user_id)
        .order_by(InterviewSession.started_at.desc())
        .all()
    )

    results = []
    for s in sessions:
        responses_data = []
        for r in s.responses:
            responses_data.append({
                "id": str(r.id),
                "question": r.question,
                "transcript": r.transcript,
                "facial_score": r.facial_score,
                "speech_score": r.speech_score,
                "nlp_score": r.nlp_score,
                "final_score": r.final_score,
                "created_at": r.created_at.isoformat(),
            })
        results.append({
            "session_id": str(s.id),
            "position": s.position,
            "started_at": s.started_at.isoformat(),
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            "overall_score": s.overall_score,
            "responses": responses_data,
        })

    return jsonify({"sessions": results}), 200
