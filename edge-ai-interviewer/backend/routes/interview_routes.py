"""
Interview routes.

Fixes applied:
- InterviewSession.query.get() replaced with db.session.get() (SQLAlchemy 2.x)
- edge_facial_score client bypass is now clamped to [0.1, 0.95] to prevent
  score injection (clients can no longer POST a perfect 1.0 to skip analysis)
- session.skills coerced to "" when None (defensive, avoids passing None to NLP)
- /analyze temp files are deleted after each chunk analysis to prevent
  unbounded disk growth during streaming live analysis calls
"""

from datetime import datetime
import os
import subprocess
import uuid
from pathlib import Path

from flask import Blueprint, request, jsonify

from extensions import db
from models.session_model import InterviewSession
from models.response_model import Response
from utils.auth_decorator import token_required
from routes.auth_routes import verify_token
from services.facial_service import facial_service
from services.speech_service import speech_service
from services.transcription_service import transcription_service
from services.transcription_service import EMPTY_TRANSCRIPT_SENTINEL
from services.nlp_service import nlp_service
from services.scoring_service import scoring_service
from services.report_service import report_service
from services.question_service import generate_questions_with_source
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
@token_required
def generate_questions_route(user_id):
    """Generate tailored interview questions using the LLM question service."""
    payload = request.get_json() or {}
    role = payload.get("role", "Software Engineer").strip()
    skills = payload.get("skills", "").strip()
    # Accept both old and new frontend payload shapes
    level = (
        payload.get("experience_level")
        or payload.get("level")
        or "Intermediate"
    ).strip()
    num_q = payload.get("question_volume", payload.get("numQuestions", 3))
    try:
        num_q = max(1, int(num_q))
    except (TypeError, ValueError):
        num_q = 3

    force_fallback = bool(payload.get("force_fallback", False))

    questions, source = generate_questions_with_source(
        role=role,
        experience=level,
        skills=skills,
        question_volume=num_q,
        force_fallback=force_fallback,
    )

    if not isinstance(questions, list) or not questions:
        questions = [f"Tell me about your experience as a {role}."]

    return jsonify({"questions": questions, "source": source}), 200


@interview_bp.post("/generate_followup")
@token_required
def generate_followup_route(user_id):
    """Generate a context-aware follow-up question."""
    payload = request.get_json() or {}
    role = payload.get("role", "Software Engineer").strip()
    level = payload.get("level", "Intermediate").strip()
    previous_q = payload.get("question", "").strip()
    answer = payload.get("transcript", "").strip()

    from services.question_service import generate_followup
    followup = generate_followup(role, level, previous_q, answer)

    return jsonify({"followup": followup}), 200


@interview_bp.post("/start")
@token_required
def start_interview(user_id):
    payload = request.get_json() or {}
    position = payload.get("position", "Software Engineer")
    level = payload.get("experience_level", "Intermediate")
    skills = payload.get("skills", "")

    session = InterviewSession(
        user_id=user_id,
        position=position,
        experience_level=level,
        skills=skills
    )
    db.session.add(session)
    db.session.commit()

    return jsonify({
        "session_id": str(session.id),
        "position": session.position,
        "experience_level": session.experience_level,
        "started_at": session.started_at.isoformat(),
    }), 201


@interview_bp.post("/submit")
@token_required
def submit_interview(user_id):
    session_id = request.form.get("session_id")
    question = request.form.get("question", "Tell me about yourself.")

    if not session_id:
        return jsonify({"message": "Missing session_id"}), 400

    # FIX: db.session.get() replaces the deprecated Query.get() (SQLAlchemy 2.x)
    session = db.session.get(InterviewSession, session_id)
    if not session:
        return jsonify({"message": "Session not found"}), 404

    video_file = request.files.get("video")
    audio_file = request.files.get("audio")

    # Allow faster uploads: if edge facial score is provided, video can be omitted.
    # Also allow audio to be omitted if video contains audio (we can extract it).
    if not video_file and not audio_file:
        return jsonify({"message": "Missing video and audio"}), 400

    video_path = save_uploaded_video(video_file, "uploads/videos") if video_file else None
    audio_path = save_uploaded_audio(audio_file, "uploads/audios") if audio_file else None

    edge_facial_str = request.form.get("edge_facial_score")
    if edge_facial_str:
        try:
            raw_edge = float(edge_facial_str)
        except (ValueError, TypeError):
            raw_edge = 0.0
    else:
        raw_edge = 0.0

    # Client may also provide an edge speech score (from browser analysis)
    edge_speech_str = request.form.get("edge_speech_score")
    if edge_speech_str:
        try:
            edge_speech = float(edge_speech_str)
        except (ValueError, TypeError):
            edge_speech = None
    else:
        edge_speech = None
    # Ensure transcript_result and speech_result always exist with sensible defaults
    transcript_result = {"transcript": EMPTY_TRANSCRIPT_SENTINEL}
    speech_result = {"speech_score": 0.83, "metrics": {}}

    # Run required heavy ops in parallel: transcription is required for NLP.
    # If client provided an `edge_facial_score`, skip facial analysis to save CPU.
    # If client provided `edge_speech_score`, use it instead of running speech analysis.
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        # If no audio upload, try extracting audio from video first.
        if audio_path:
            fut_trans = executor.submit(transcription_service.transcribe, audio_path)
        else:
            fut_trans = executor.submit(lambda: {"transcript": EMPTY_TRANSCRIPT_SENTINEL, "language": "unknown", "duration": 0.0})

        fut_speech = None
        if edge_speech is None and audio_path:
            fut_speech = executor.submit(speech_service.analyze_audio, audio_path)

        fut_facial = None
        if raw_edge <= 0 and video_path:
            fut_facial = executor.submit(facial_service.analyze_video, video_path)

        # Collect results with sensible timeouts
        try:
            transcript_result = fut_trans.result(timeout=120)
        except Exception:
            transcript_result = {"transcript": "Transcription unavailable. Timeout or error.", "language": "unknown", "duration": 0.0}

        # Robustness: if the dedicated audio upload is empty/silent or fails to transcribe,
        # try extracting audio from the uploaded video container and transcribe that instead.
        try:
            tr_text = (transcript_result or {}).get("transcript", "")
            needs_fallback = (
                (tr_text == EMPTY_TRANSCRIPT_SENTINEL)
                or (isinstance(tr_text, str) and tr_text.startswith("Transcription unavailable"))
            )
            if needs_fallback and video_path and Path(video_path).exists():
                tmp_dir = Path("uploads/audios/temp")
                tmp_dir.mkdir(parents=True, exist_ok=True)
                extracted = tmp_dir / f"{uuid.uuid4().hex}_from_video.wav"
                cmd = [
                    "ffmpeg", "-y",
                    "-i", str(video_path),
                    "-vn",
                    "-ar", "16000",
                    "-ac", "1",
                    str(extracted),
                ]
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
                if r.returncode == 0 and extracted.exists() and extracted.stat().st_size > 0:
                    transcript_result = transcription_service.transcribe(str(extracted))
                try:
                    if extracted.exists():
                        extracted.unlink()
                except OSError:
                    pass
        except Exception:
            # If fallback extraction fails, keep original transcript_result.
            pass

        if fut_speech:
            try:
                speech_result = fut_speech.result(timeout=60)
            except Exception:
                speech_result = {"speech_score": 0.83, "metrics": {"clarity": "Error"}}
        elif edge_speech is not None:
            # Use client-provided speech score
            speech_result = {"speech_score": max(0.0, min(edge_speech, 1.0)), "metrics": {"source": "client"}}

        if fut_facial:
            try:
                facial_result = fut_facial.result(timeout=60)
            except Exception:
                facial_result = {"facial_score": 0.1, "metrics": {}}
        else:
            # Client provided facial score — clamp to safe range
            facial_score = max(0.1, min(raw_edge, 0.95)) if raw_edge > 0 else 0.1
            facial_result = {"facial_score": facial_score, "metrics": {"source": "client"}}

        facial_score = facial_result.get("facial_score", 0.1)
        facial_score = max(0.1, min(float(facial_score), 1.0))

    # FIX: Coerce session.skills to "" when None so nlp_service never receives None
    session_skills = session.skills or "" if hasattr(session, "skills") else ""

    nlp_result = nlp_service.score_relevance(
        question,
        transcript_result.get("transcript", ""),
        skills=session_skills,
    )

    scores = scoring_service.compute_final_score(
        facial_score,
        speech_result["speech_score"],
        nlp_result["nlp_score"],
    )

    response = Response(
        session_id=session.id,
        question=question,
        transcript=transcript_result.get("transcript", ""),
        facial_score=facial_score,
        speech_score=speech_result["speech_score"],
        nlp_score=nlp_result["nlp_score"],
        final_score=scores["final_score"],
    )
    db.session.add(response)

    # Update session overall score (simple average of all responses)
    session.completed_at = datetime.utcnow()
    existing_scores = [r.final_score for r in session.responses if r.final_score is not None]
    scores_list = existing_scores + [scores["final_score"]]
    session.overall_score = sum(scores_list) / len(scores_list)

    db.session.commit()

    # Generate detailed feedback (role and level aware)
    report = report_service.generate_feedback(
        {
            "facial": response.facial_score,
            "speech": response.speech_score,
            "nlp": response.nlp_score,
            "final": response.final_score,
        },
        response.transcript,
        speech_details=speech_result,
        nlp_details=nlp_result,
        role=session.position,
        level=session.experience_level,
        question=question,
        facial_details=facial_result,   # Always passed so eye_contact/posture populate
        skip_ai=True,                  # Performance: don't block /submit on phi3 feedback
    )

    return jsonify({
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
        "metrics": report["key_metrics"],
    }), 201


@interview_bp.post("/analyze")
@token_required
def analyze_chunk(user_id):
    """Analyze a short audio/video chunk and return intermediate scores.

    FIX: Temp files are now deleted after analysis to prevent unbounded
    disk growth — this endpoint is called repeatedly during live recording.
    """
    session_id = request.form.get("session_id")
    if session_id:
        # FIX: db.session.get() replaces deprecated Query.get()
        session = db.session.get(InterviewSession, session_id)
        if not session:
            return jsonify({"message": "Session not found"}), 404

    video_file = request.files.get("video")
    audio_file = request.files.get("audio")
    if not video_file or not audio_file:
        return jsonify({"message": "Missing video or audio"}), 400

    video_path = save_uploaded_video(video_file, "uploads/videos/temp")
    audio_path = save_uploaded_audio(audio_file, "uploads/audios/temp")

    try:
        facial_result = facial_service.analyze_video(video_path)
        speech_result = speech_service.analyze_audio(audio_path)
    finally:
        # FIX: Always clean up temp chunk files — previously these accumulated
        # indefinitely since /analyze is called on every recorded chunk.
        for path in (video_path, audio_path):
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except OSError as e:
                    import logging
                    logging.warning(f"Could not delete temp chunk file {path}: {e}")

    return jsonify({
        "facial": facial_result.get("facial_score"),
        "speech": speech_result.get("speech_score"),
    }), 200
@interview_bp.get("/history")
@token_required
def get_history(user_id):
    """Return all completed interview sessions for the current user,
    sorted by most recent first, including per-session scores and feedback."""
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