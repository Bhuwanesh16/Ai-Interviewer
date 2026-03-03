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

        # --- Rules-Based Fallback: Feedback driven by score breakdown ---
        feedback_points = []
        suggestions = []
        facial_pct = int(round((facial or 0) * 100))
        speech_pct = int(round((speech or 0) * 100))
        nlp_pct = int(round((nlp or 0) * 100))

        nlp_metrics = nlp_details.get("metrics", {}) if nlp_details else {}
        is_valid = nlp_details.get("is_valid", True) if nlp_details else True
        word_count = nlp_metrics.get("word_count", 0 if is_fallback_transcript else len(transcript.split()))
        speech_metrics = speech_details.get("metrics", {}) if speech_details else {}
        clarity = speech_metrics.get("clarity", "Unknown")
        pace = speech_metrics.get("pace", "Optimal")
        filler_count = nlp_metrics.get("filler_word_count", 0)

        # Score-based opening: tie feedback to the three dimensions
        feedback_points.append(
            f"Based on your scores (Expression {facial_pct}%, Voice clarity {speech_pct}%, Content relevance {nlp_pct}%): "
            + f"Expression was {'strong' if facial_pct >= 70 else 'adequate' if facial_pct >= 50 else 'low'}, "
            + f"voice clarity was {'clear' if speech_pct >= 70 else 'acceptable' if speech_pct >= 50 else 'needs improvement'}, "
            + f"and content relevance was {'strong' if nlp_pct >= 70 else 'moderate' if nlp_pct >= 50 else 'below target'}."
        )

        # 1. Technical / transcript issues
        if is_fallback_transcript:
            feedback_points.append("Audio capture encountered technical hurdles, preventing full semantic analysis of your response.")
            suggestions.append("Verify your hardware connection and test your microphone in the setup screen to ensure clear recording.")
        # 2. Content (driven by nlp score)
        elif nlp < 0.3 or not is_valid:
            feedback_points.append("Content relevance was low — the response lacked direct alignment with the specific engineering constraints mentioned in the question.")
            suggestions.append("Focus on the 'Action' phase of your answer; clearly define the steps you took rather than speaking in generalities.")
        elif nlp >= 0.85:
            feedback_points.append("Your technical depth was outstanding; you correctly addressed the core system design trade-offs.")
        elif nlp >= 0.5:
            feedback_points.append("Content relevance was moderate. Integrating more specific technical implementation details would strengthen your authority.")
            suggestions.append("Weave in role-specific keywords from the job description and concrete, job-relevant examples.")
        else:
            feedback_points.append("Content relevance was below target. Industrial-level interviews require more elaboration on the 'Result' aspect of your work and alignment with the question.")
            suggestions.append("Align your answers more closely with the job description by using role-specific keywords and concrete, job-relevant examples.")

        # 3. Delivery (driven by speech score)
        if clarity in ("Error", "Unknown", "No Signal"):
            feedback_points.append("Audio analysis encountered technical issues; voice clarity could not be fully assessed.")
            suggestions.append("Verify your microphone and try again in a quiet environment.")
        elif speech < 0.5 or clarity == "Low Quality":
            feedback_points.append("Voice clarity was weak — the audio had interference or low quality, which would make it difficult for interviewers to follow your logic.")
            suggestions.append("Speak clearly and test your microphone; ensure minimal background noise.")
        elif pace == "Fast":
            feedback_points.append("Your pace was somewhat rushed. Slowing down by about 10–15% will help your technical points land better.")
            suggestions.append("Apply intentional pauses after significant technical points to let the interviewer digest the information.")
        elif pace == "Slow":
            feedback_points.append("Your delivery was very deliberate. A slightly more energetic pace would convey more enthusiasm for the role.")

        # 4. Expression (driven by facial score)
        if facial < 0.4:
            feedback_points.append("Expression was low. Demonstrating more facial engagement and energy can help build a stronger connection with the hiring team.")
            suggestions.append("Maintain more consistent, engaged facial expressions to project confidence and interest.")
        elif facial >= 0.8:
            feedback_points.append("You maintained an excellent professional presence and looked comfortable while explaining complex ideas.")

        # 5. Length / structure (context for content score)
        if word_count > 60:
            feedback_points.append("You provided a thorough explanation with good narrative stamina.")
        elif 0 < word_count < 25 and not is_fallback_transcript:
            feedback_points.append("The response was quite brief; more elaboration on the 'Result' aspect of your work would strengthen it.")

        # 6. Filler words
        if filler_count > 5:
            feedback_points.append(f"Verbal fillers ({filler_count} hits) slightly interrupted the flow of your explanation.")
            suggestions.append("Replace filler words with silent 'thinking pauses' — this projects more confidence than filled pauses.")

        fallback_feedback = " ".join(feedback_points)
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


report_service = ReportService()
