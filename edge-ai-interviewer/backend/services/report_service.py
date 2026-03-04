"""
Report generation service.

Generates detailed, professional feedback and actionable suggestions 
based on scores (facial, speech, NLP) and semantic analysis of the transcript.
Attempts LLM-based personalized feedback first, with a rich rules-based fallback.
"""

import random
from typing import Dict, List
from services.question_service import generate_ai_feedback


class ReportService:
    def generate_feedback(
        self, 
        scores: Dict[str, float], 
        transcript: str, 
        speech_details: Dict[str, any] = None, 
        nlp_details: Dict[str, any] = None,
        role: str = "Candidate",
        level: str = "Intermediate",
        question: str = ""
    ) -> Dict[str, any]:
        facial = scores.get("facial", 0)
        speech = scores.get("speech", 0)
        nlp = scores.get("nlp", 0)
        final = scores.get("final", 0)

        is_fallback_transcript = any(x in transcript for x in ["Transcription unavailable", "(Speech parsing error", "(Audio file missing)"])
        
        # --- Attempt AI-Led Feedback First ---
        if not is_fallback_transcript and len(transcript.strip()) > 30:
            ai_data = generate_ai_feedback(role, level, question, transcript, scores)
            if ai_data and ai_data.get("feedback"):
                # Success! Return AI feedback
                return self._finalize_report(scores, transcript, ai_data["feedback"], ai_data["suggestions"], speech_details, nlp_details, is_fallback_transcript)

        # --- Rules-Based Fallback ---
        # Advanced Phrasing Engine
        phrasings = {
            "strengths": {
                "high": ["You demonstrated exceptional technical depth.", "Your response shows a clear command of this domain.", "Excellent articulation of core engineering concepts."],
                "mid": ["You have a solid foundational understanding of the topic.", "Your answer correctly identifies the primary trade-offs.", "Good effort in structuring your technical explanation."],
                "low": ["Appreciate your direct approach to the question.", "You clearly put thought into the implementation details.", "Good energy throughout your response."]
            },
            "nlp": {
                "high": "Your content alignment was outstanding, covering both the direct constraints and wider architectural implications.",
                "mid": "The response was relevant and covered the basics, though adding more quantitative results would strengthen it.",
                "low": "The content diverged significantly from the core question. Focus on addressing the specific 'Problem' stated."
            },
            "speech": {
                "high": "Your delivery was exceptionally clear, with professional modulation and a steady, authoritative pace.",
                "mid": "Clarity was sufficient for a technical discussion, with minor room for improvement in verbal energy.",
                "low": "Speech clarity was below the expected professional standard, which might lead to miscommunication in team settings."
            },
            "facial": {
                "high": "You maintained excellent professional presence and looked comfortable with the complexity of the topic.",
                "mid": "Presence was adequate, though more active engagement can help build better rapport with stakeholders.",
                "low": "Non-verbal engagement was limited; projecting more energy would help convey technical confidence."
            }
        }

        # Select phrasings based on scores
        def pick(category, score):
            if score >= 0.85: tier = "high"
            elif score >= 0.5: tier = "mid"
            else: tier = "low"
            val = phrasings[category][tier]
            return random.choice(val) if isinstance(val, list) else val

        feedback_sections = []
        
        nlp_metrics = nlp_details.get("metrics", {}) if nlp_details else {}
        is_valid = nlp_details.get("is_valid", True) if nlp_details else True
        word_count = nlp_metrics.get("word_count", 0 if is_fallback_transcript else len(transcript.split()))

        # 1. Strengths section (always first)
        overall_avg = (facial + speech + nlp) / 3
        feedback_sections.append(f"Strengths: {pick('strengths', overall_avg)}")

        # 2. Detailed Dimension Assessment
        evaluator_notes = []
        evaluator_notes.append(pick("nlp", nlp))
        evaluator_notes.append(pick("speech", speech))
        evaluator_notes.append(pick("facial", facial))
        
        if is_fallback_transcript:
            evaluator_notes.append("Note: Audio capture encountered technical hurdles, limiting full semantic analysis.")
        elif word_count < 20:
            evaluator_notes.append("The response was quite brief; industrial-level interviews usually require more elaboration on the 'Result' aspect.")

        feedback_sections.append(f"Evaluator Notes: {' '.join(evaluator_notes)}")

        suggestions = []
        # Suggestions based on weakest area
        weakest = min([("nlp", nlp), ("speech", speech), ("facial", facial)], key=lambda x: x[1])
        if weakest[0] == "nlp":
            suggestions = ["Incorporate more role-specific technical keywords.", "Use the STAR method to structure your narrative.", "Elaborate more on specific trade-offs made."]
        elif weakest[0] == "speech":
            suggestions = ["Work on a more consistent speaking pace.", "Practice intentional pauses after major points.", "Ensure you're recording in a low-noise environment."]
        else:
            suggestions = ["Maintain more consistent eye contact with the camera.", "Project more energy into your delivery.", "Practice in front of a mirror to observe your micro-expressions."]

        if is_fallback_transcript:
            suggestions.append("Verify your hardware connection and mic settings.")

        fallback_feedback = "\n\n".join(feedback_sections)
        return self._finalize_report(scores, transcript, fallback_feedback, suggestions, speech_details, nlp_details, is_fallback_transcript)

    def _finalize_report(self, scores, transcript, feedback, suggestions, speech_details, nlp_details, is_fallback_transcript):
        nlp_metrics = nlp_details.get("metrics", {}) if nlp_details else {}
        speech_metrics = speech_details.get("metrics", {}) if speech_details else {}
        speech_score = scores.get("speech", 0) or (speech_details.get("speech_score") if speech_details else 0)
        nlp_score = scores.get("nlp", 0)
        final = scores.get("final", 0)
        is_valid = nlp_details.get("is_valid", True) if nlp_details else True
        word_count = nlp_metrics.get("word_count", 0 if is_fallback_transcript else len(transcript.split()))
        filler_count = nlp_metrics.get("filler_word_count", 0)

        # Derive pace & clarity from speech_score when raw metrics are Error/Unknown
        raw_pace = speech_metrics.get("pace", "Optimal")
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

        # Derive content_validity from nlp_score when raw says Weak/Unrelated
        raw_validity = nlp_metrics.get("content_validity", "Confirmed")
        if raw_validity == "Weak/Unrelated" and nlp_score >= 0.35:
            content_validity = "Partial"
        elif is_fallback_transcript:
            content_validity = "N/A"
        else:
            content_validity = "Confirmed" if (is_valid or nlp_score >= 0.25) else "Weak/Unrelated"

        # Verdict logic (Consistent)
        if is_fallback_transcript:
            verdict = "Technical Difficulty - Transcription Unavailable"
        elif not is_valid and nlp_score < 0.2:
            verdict = "Non-Responsive - High Divergence"
        elif final > 0.88:
            verdict = "Outstanding - Role-Ready Lead"
        elif final > 0.72:
            verdict = "Professional - Mid-to-Senior Standard"
        elif final > 0.55:
            verdict = "Developing - Capable with Polished Delivery"
        else:
            verdict = "Needs Refinement - Focus on Structure"

        return {
            "overall_feedback": feedback,
            "verdict": verdict,
            "suggestions": list(set(suggestions))[:4],
            "key_metrics": {
                "word_count": word_count,
                "filler_word_frequency": f"{(filler_count / max(word_count, 1)) * 10:.2f}",
                "filler_count": filler_count,
                "speaking_rate": pace,
                "clarity_rating": clarity,
                "content_validity": content_validity,
                "sentiment_profile": "Professional & Balanced" if final > 0.7 else "Developing Authority"
            }
        }

    def aggregate_session_report(self, responses: List[Dict]) -> Dict[str, any]:
        """Generates a holistic summary across multiple interview responses."""
        if not responses:
            return {"executive_summary": "No data available.", "overall_verdict": "N/A"}

        avg_score = sum(r.get('final_score', 0) for r in responses) / len(responses)
        
        # Analyze trends
        if len(responses) >= 2:
            first_half = sum(r.get('final_score', 0) for r in responses[:len(responses)//2]) / (len(responses)//2)
            second_half = sum(r.get('final_score', 0) for r in responses[len(responses)//2:]) / (len(responses) - len(responses)//2)
            trend = "improving" if second_half > first_half + 0.05 else "declining" if second_half < first_half - 0.05 else "consistent"
        else:
            trend = "stable"

        # Holistic verdict
        if avg_score > 0.85: verdict = "Ready for Senior/Lead roles with exceptional delivery."
        elif avg_score > 0.70: verdict = "Strong professional standard; minor refinements needed in delivery."
        elif avg_score > 0.50: verdict = "Capable with good foundations; focus on technical depth and confidence."
        else: verdict = "Developing performance; significant growth needed in technical articulation."

        executive_summary = (
            f"Overall, you maintained a {trend} performance level with an average score of {int(avg_score*100)}%. "
            + f"Your performance suggests a '{verdict.split(';')[0]}' status. "
            + ("You showed notable improvement as the session progressed." if trend == "improving" else "")
        )

        return {
            "executive_summary": executive_summary,
            "overall_verdict": verdict,
            "session_trend": trend,
            "response_count": len(responses)
        }


report_service = ReportService()
