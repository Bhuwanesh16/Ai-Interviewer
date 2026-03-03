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

        # --- Rules-Based Fallback (Dynamic & Real) ---
        feedback_points = []
        suggestions = []
        
        nlp_metrics = nlp_details.get("metrics", {}) if nlp_details else {}
        is_valid = nlp_details.get("is_valid", True) if nlp_details else True
        word_count = nlp_metrics.get("word_count", 0 if is_fallback_transcript else len(transcript.split()))

        # 1. Content Evaluation
        if is_fallback_transcript:
            feedback_points.append("Audio capture encountered technical hurdles, preventing a full semantic analysis of your response.")
            suggestions.append("Verify your hardware connection and test your microphone in the setup screen to ensure clear recording.")
        elif not is_valid or nlp < 0.3:
            feedback_points.append("The response lacked direct alignment with the specific engineering constraints mentioned in the question.")
            suggestions.append("Focus on the 'Action' phase of your answer; clearly define the steps you took rather than speaking in generalities.")
        elif nlp >= 0.85:
            feedback_points.append(random.choice([
                "Your technical depth was outstanding, correctly identifying and addressing the core system design trade-offs.",
                "Excellent precision in your answer. You utilized industry-standard terminology that demonstrated high seniority.",
                "Deep conceptual mastery detected. Your response was well-structured and directly hit all key technical requirements."
            ]))
        else:
            feedback_points.append("Your response covered the basics well, though integrating more specific technical implementation details would strengthen your authority.")

        # 2. Delivery & Communication
        speech_metrics = speech_details.get("metrics", {}) if speech_details else {}
        clarity = speech_metrics.get("clarity", "Unknown")
        pace = speech_metrics.get("pace", "Optimal")
        
        if clarity == "Low Quality":
            feedback_points.append("The audio signal had significant interference. In a real interview, this would make it difficult for interviewers to follow your logic.")
        
        if pace == "Fast":
            feedback_points.append("Your pace was somewhat rushed. Slowing down by about 10-15% will help your more complex technical points land with the interviewer.")
            suggestions.append("Apply intentional pauses after making a significant technical point to allow the interviewer to digest the information.")
        elif pace == "Slow":
            feedback_points.append("Your delivery was very deliberate. While clear, a slightly more energetic pace would convey more enthusiasm for the role.")

        # 3. Non-Verbal Impact
        if facial < 0.4:
            feedback_points.append("Your facial energy remained relatively low. Demonstrating more engagement visually can help build a stronger connection with the hiring team.")
        elif facial > 0.8:
            feedback_points.append("You maintained an excellent professional presence and looked comfortable while explaining complex ideas.")

        # 4. Content Structure
        if word_count > 60:
            feedback_points.append("Good narrative stamina. You provided a thorough explanation that allowed for a meaningful evaluation of your approach.")
        elif 0 < word_count < 25:
            feedback_points.append("The response was quite brief. Industrial-level technical interviews usually require more elaboration on the 'Result' aspect of your work.")

        # Filler words
        filler_count = nlp_metrics.get("filler_word_count", 0)
        if filler_count > 5:
            feedback_points.append(f"The frequency of verbal fillers ('{filler_count}') slightly interrupted the professional flow of your explanation.")
            suggestions.append("Replace filler words with silent 'thinking pauses' — this actually projects more confidence than filled pauses.")

        fallback_feedback = " ".join(feedback_points)
        return self._finalize_report(scores, transcript, fallback_feedback, suggestions, speech_details, nlp_details, is_fallback_transcript)

    def _finalize_report(self, scores, transcript, feedback, suggestions, speech_details, nlp_details, is_fallback_transcript):
        nlp_metrics = nlp_details.get("metrics", {}) if nlp_details else {}
        speech_metrics = speech_details.get("metrics", {}) if speech_details else {}
        final = scores.get("final", 0)
        is_valid = nlp_details.get("is_valid", True) if nlp_details else True
        word_count = nlp_metrics.get("word_count", 0 if is_fallback_transcript else len(transcript.split()))
        filler_count = nlp_metrics.get("filler_word_count", 0)

        # Verdict logic (Consistent)
        if is_fallback_transcript:
            verdict = "Technical Difficulty - Transcription Unavailable"
        elif not is_valid:
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
                "speaking_rate": speech_metrics.get("pace", "Optimal"),
                "clarity_rating": speech_metrics.get("clarity", "High"),
                "content_validity": "N/A" if is_fallback_transcript else nlp_metrics.get("content_validity", "Confirmed"),
                "sentiment_profile": "Professional & Balanced" if final > 0.7 else "Developing Authority"
            }
        }


report_service = ReportService()
