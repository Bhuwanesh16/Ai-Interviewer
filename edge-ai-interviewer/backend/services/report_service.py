"""
Report generation service.

Performance fixes:
- Added skip_ai parameter to generate_feedback(). When True, the phi3
  AI feedback call is bypassed entirely and rules-based feedback is used.
  result_routes.py passes skip_ai=True so result page loads never trigger
  a 30-60s phi3 inference. AI feedback only runs during submit.
- Rules-based path is now the fast default for result fetching.
- _is_fallback() and sentinel import unchanged.
"""

import random
from typing import Dict, List
import logging

try:
    from services.transcription_service import EMPTY_TRANSCRIPT_SENTINEL
except ImportError:
    EMPTY_TRANSCRIPT_SENTINEL = "__EMPTY_AUDIO__"

try:
    from services.question_service import generate_ai_feedback
    AI_FEEDBACK_AVAILABLE = True
except Exception as _import_err:
    AI_FEEDBACK_AVAILABLE = False
    logging.warning(f"generate_ai_feedback unavailable: {_import_err}. Rules-based fallback will be used.")

    def generate_ai_feedback(*args, **kwargs):
        return None


_FALLBACK_TRANSCRIPT_MARKERS = [
    "Transcription unavailable",
    "(Speech parsing error",
    "(Audio file missing)",
    "openai-whisper not installed",
    EMPTY_TRANSCRIPT_SENTINEL,
]


def _is_fallback(transcript: str) -> bool:
    return any(marker in (transcript or "") for marker in _FALLBACK_TRANSCRIPT_MARKERS)


class ReportService:
    def generate_feedback(
        self,
        scores: Dict[str, float],
        transcript: str,
        speech_details: Dict[str, any] = None,
        nlp_details: Dict[str, any] = None,
        role: str = "Candidate",
        level: str = "Intermediate",
        question: str = "",
        facial_details: Dict[str, any] = None,
        skip_ai: bool = False,          # FIX: when True, skip phi3 entirely
    ) -> Dict[str, any]:
        facial = scores.get("facial", 0)
        speech = scores.get("speech", 0)
        nlp    = scores.get("nlp", 0)
        final  = scores.get("final", 0)

        is_fallback_transcript = _is_fallback(transcript)

        # ── AI feedback path (submit only, not result fetch) ──────────────────
        if (
            not skip_ai
            and not is_fallback_transcript
            and len((transcript or "").strip()) > 30
            and AI_FEEDBACK_AVAILABLE
        ):
            try:
                ai_data = generate_ai_feedback(role, level, question, transcript, scores)
                if ai_data and ai_data.get("feedback"):
                    return self._finalize_report(
                        scores, transcript,
                        ai_data["feedback"], ai_data["suggestions"],
                        speech_details, nlp_details,
                        is_fallback_transcript, facial_details
                    )
            except Exception as exc:
                logging.warning(f"AI feedback failed, falling back to rules: {exc}")

        # ── Fast rules-based path ─────────────────────────────────────────────
        phrasings = {
            "strengths": {
                "high": [
                    "You demonstrated exceptional technical depth.",
                    "Your response shows a clear command of this domain.",
                    "Excellent articulation of core engineering concepts."
                ],
                "mid": [
                    "You have a solid foundational understanding of the topic.",
                    "Your answer correctly identifies the primary trade-offs.",
                    "Good effort in structuring your technical explanation."
                ],
                "low": [
                    "Appreciate your direct approach to the question.",
                    "You clearly put thought into the implementation details.",
                    "Good energy throughout your response."
                ]
            },
            "nlp": {
                "high": "Your content alignment was outstanding, covering both the direct constraints and wider architectural implications.",
                "mid":  "The response was relevant and covered the basics, though adding more quantitative results would strengthen it.",
                "low":  "The content diverged significantly from the core question. Focus on addressing the specific problem stated.",
            },
            "speech": {
                "high": "Your delivery was exceptionally clear, with professional modulation and a steady, authoritative pace.",
                "mid":  "Clarity was sufficient for a technical discussion, with minor room for improvement in verbal energy.",
                "low":  "Speech clarity was below the expected professional standard, which might lead to miscommunication in team settings.",
            },
            "facial": {
                "high": "You maintained excellent professional presence and looked comfortable with the complexity of the topic.",
                "mid":  "Presence was adequate, though more active engagement can help build better rapport with stakeholders.",
                "low":  "Non-verbal engagement was limited; projecting more energy would help convey technical confidence.",
            }
        }

        def pick(category, score):
            if score is None:
                if category == "nlp":
                    return "Note: Content analysis was bypassed due to a transcription interruption."
                return "Data for this metric was inconclusive due to technical hardware hurdles."
            tier = "high" if score >= 0.85 else "mid" if score >= 0.5 else "low"
            val = phrasings[category][tier]
            return random.choice(val) if isinstance(val, list) else val

        nlp_metrics = nlp_details.get("metrics", {}) if nlp_details else {}
        is_valid    = nlp_details.get("is_valid", True) if nlp_details else True
        word_count  = nlp_metrics.get("word_count", 0 if is_fallback_transcript else len((transcript or "").split()))

        active_vals  = [v for v in [facial, speech, nlp] if v is not None]
        overall_avg  = sum(active_vals) / len(active_vals) if active_vals else 0.0

        feedback_sections = [f"Strengths: {pick('strengths', overall_avg)}"]

        evaluator_notes = [
            pick("nlp",    nlp),
            pick("speech", speech),
            pick("facial", facial),
        ]

        if is_fallback_transcript:
            evaluator_notes.append(
                "Note: Audio capture encountered technical hurdles, limiting full semantic analysis."
            )
        elif word_count < 20:
            evaluator_notes.append(
                "The response was quite brief; industrial-level interviews usually require "
                "more elaboration on the Result aspect."
            )

        feedback_sections.append(f"Evaluator Notes: {' '.join(evaluator_notes)}")

        valid_scores = [(k, v) for k, v in [("nlp", nlp), ("speech", speech), ("facial", facial)] if v is not None]
        weakest = min(valid_scores, key=lambda x: x[1]) if valid_scores else ("speech", 0)

        if weakest[0] == "nlp":
            suggestions = [
                "Incorporate more role-specific technical keywords.",
                "Use the STAR method to structure your narrative.",
                "Elaborate more on specific trade-offs made.",
            ]
        elif weakest[0] == "speech":
            suggestions = [
                "Work on a more consistent speaking pace.",
                "Practice intentional pauses after major points.",
                "Ensure you are recording in a low-noise environment.",
            ]
        else:
            suggestions = [
                "Maintain more consistent eye contact with the camera.",
                "Project more energy into your delivery.",
                "Practice in front of a mirror to observe your micro-expressions.",
            ]

        if is_fallback_transcript:
            suggestions.append("Verify your hardware connection and mic settings.")

        return self._finalize_report(
            scores, transcript,
            "\n\n".join(feedback_sections), suggestions,
            speech_details, nlp_details,
            is_fallback_transcript, facial_details
        )

    def _finalize_report(
        self,
        scores, transcript, feedback, suggestions,
        speech_details, nlp_details,
        is_fallback_transcript, facial_details=None
    ):
        nlp_metrics    = nlp_details.get("metrics", {})    if nlp_details    else {}
        speech_metrics = speech_details.get("metrics", {}) if speech_details else {}
        facial_metrics = facial_details.get("metrics", {}) if facial_details else {}

        speech_score = scores.get("speech", 0) or (speech_details.get("speech_score") if speech_details else 0)
        nlp_score    = scores.get("nlp", 0)
        final        = scores.get("final", 0)
        is_valid     = nlp_details.get("is_valid", True) if nlp_details else True
        word_count   = nlp_metrics.get("word_count", 0 if is_fallback_transcript else len((transcript or "").split()))
        filler_count = nlp_metrics.get("filler_word_count", 0)

        raw_pace    = speech_metrics.get("pace",    "Optimal")
        raw_clarity = speech_metrics.get("clarity", "High")
        if raw_clarity in ("Error", "Unknown", "No Signal") or raw_pace == "Unknown":
            if speech_score >= 0.75:
                pace, clarity = "Optimal", "High"
            elif speech_score >= 0.5:
                pace, clarity = "Moderate", "Moderate"
            elif speech_score > 0:
                pace, clarity = "Fast", "Low Quality"
            else:
                pace, clarity = "Unknown", "Unknown"
        else:
            pace, clarity = raw_pace, raw_clarity

        raw_validity = nlp_metrics.get("content_validity", "Confirmed")
        cmp_nlp = nlp_score if nlp_score is not None else 0.0

        if is_fallback_transcript:
            content_validity = "N/A"
        elif raw_validity == "Weak/Unrelated" and cmp_nlp >= 0.35:
            content_validity = "Partial"
        else:
            content_validity = "Confirmed" if (is_valid or cmp_nlp >= 0.25) else "Weak/Unrelated"

        if is_fallback_transcript:
            verdict = "Technical Difficulty - Transcription Unavailable"
        elif not is_valid and cmp_nlp < 0.2:
            verdict = "Non-Responsive - High Divergence"
        elif final > 0.88:
            verdict = "Outstanding - Role-Ready Lead"
        elif final > 0.72:
            verdict = "Professional - Mid-to-Senior Standard"
        elif final > 0.55:
            verdict = "Developing - Capable with Polished Delivery"
        else:
            verdict = "Needs Refinement - Focus on Structure"

        deduplicated_suggestions = list(dict.fromkeys(suggestions))[:4]

        return {
            "overall_feedback": feedback,
            "verdict":          verdict,
            "suggestions":      deduplicated_suggestions,
            "key_metrics": {
                "word_count":            word_count,
                "filler_word_frequency": f"{(filler_count / max(word_count, 1)) * 10:.2f}",
                "filler_count":          filler_count,
                "speaking_rate":         pace,
                "clarity_rating":        clarity,
                "content_validity":      content_validity,
                "eye_contact":           facial_metrics.get("eye_contact", "N/A"),
                "body_language":         facial_metrics.get("posture",     "N/A"),
                "confidence_level":      speech_metrics.get("confidence",  "N/A"),
                "sentiment_profile":     "Professional & Balanced" if final > 0.7 else "Developing Authority",
            }
        }

    def aggregate_session_report(self, responses: List[Dict]) -> Dict[str, any]:
        """Holistic summary across multiple interview responses."""
        if not responses:
            return {"executive_summary": "No data available.", "overall_verdict": "N/A"}

        avg_score = sum(r.get("final_score", 0) for r in responses) / len(responses)

        if len(responses) >= 2:
            mid         = len(responses) // 2
            first_half  = sum(r.get("final_score", 0) for r in responses[:mid])  / mid
            second_half = sum(r.get("final_score", 0) for r in responses[mid:])  / (len(responses) - mid)
            trend = (
                "improving"  if second_half > first_half + 0.05 else
                "declining"  if second_half < first_half - 0.05 else
                "consistent"
            )
        else:
            trend = "stable"

        if avg_score > 0.85:
            verdict = "Ready for Senior/Lead roles with exceptional delivery."
        elif avg_score > 0.70:
            verdict = "Strong professional standard; minor refinements needed in delivery."
        elif avg_score > 0.50:
            verdict = "Capable with good foundations; focus on technical depth and confidence."
        else:
            verdict = "Developing performance; significant growth needed in technical articulation."

        avg_pct = round(avg_score * 100)
        executive_summary = (
            f"Overall, you maintained a {trend} performance level with an average score of {avg_pct}%. "
            f"Your performance suggests a '{verdict.split(';')[0]}' status. "
            + ("You showed notable improvement as the session progressed." if trend == "improving" else "")
        )

        return {
            "executive_summary": executive_summary,
            "overall_verdict":   verdict,
            "session_trend":     trend,
            "response_count":    len(responses),
        }


report_service = ReportService()