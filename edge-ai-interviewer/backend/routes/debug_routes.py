from flask import Blueprint, request, jsonify

from services.nlp_service import nlp_service
from services.transcription_service import transcription_service, EMPTY_TRANSCRIPT_SENTINEL

debug_bp = Blueprint("debug", __name__)


@debug_bp.get("/nlp_check")
def nlp_check():
    """Quick nlp checker for manual testing.

    Usage: GET /api/debug/nlp_check?question=...&answer=...
    If no params provided, runs a small set of canned examples.
    """
    q = request.args.get("question")
    a = request.args.get("answer")

    samples = []
    if q and a:
        samples = [(q, a)]
    else:
        samples = [
            ("Tell me about a time you solved a challenging technical problem.",
             "I debugged a race condition in our distributed cache by adding locks and retries."),
            ("Explain how you design scalable APIs.",
             "I use RESTful routes, pagination, and rate limiting. We shard the DB."),
            ("Any short answer", "OK."),
            ("Any empty audio", EMPTY_TRANSCRIPT_SENTINEL),
            ("Unrelated question", "I like pizza and movies."),
        ]

    results = []
    for question, answer in samples:
        res = nlp_service.score_relevance(question, answer, skills="python,react")
        results.append({"question": question, "answer": answer, "nlp": res})

    return jsonify({"results": results, "asr_status": transcription_service.status()}), 200


@debug_bp.get("/asr_status_brief")
def asr_brief():
    st = transcription_service.status()
    return jsonify({"ffmpeg": st.get("ffmpeg"), "whisper_installed": st.get("whisper_installed"), "model_loaded": st.get("model_loaded"), "message": st.get("message")} ), 200
