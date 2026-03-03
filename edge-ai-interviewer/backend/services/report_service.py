"""
Report generation service.

Generates detailed, professional feedback and actionable suggestions 
based on scores (facial, speech, NLP) and semantic analysis of the transcript.
"""

from typing import Dict, List


class ReportService:
    def generate_feedback(self, scores: Dict[str, float], transcript: str, speech_details: Dict[str, any] = None, nlp_details: Dict[str, any] = None) -> Dict[str, any]:
        facial = scores.get("facial", 0)
        speech = scores.get("speech", 0)
        nlp = scores.get("nlp", 0)
        final = scores.get("final", 0)

        feedback = []
        suggestions = []

        is_fallback_transcript = any(x in transcript for x in ["Transcription unavailable", "(Speech parsing error", "(Audio file missing)"])
        
        # 1. Content Validity & Semantic Alignment (Industrial Standard)
        is_valid = nlp_details.get("is_valid", True) if nlp_details else True
        nlp_metrics = nlp_details.get("metrics", {}) if nlp_details else {}
        
        if is_fallback_transcript:
            feedback.append("We couldn't process the audio content for a full semantic analysis. Ensure your audio is clear.")
            suggestions.append("Check your microphone settings and minimize background noise for better automated feedback.")
        elif not is_valid:
            feedback.append("The response relevance was flagged as weak. Ensure you focus on directly answering the specific question asked.")
            suggestions.append("Structure your answer by first restating the core problem briefly before diving into your solution.")
        elif nlp >= 0.8:
            feedback.append("Excellent content alignment. Your answer demonstrated deep expertise and addressed technical keywords effectively.")
        else:
            feedback.append("Good response foundation. Strengthening your use of industry-specific terminology would enhance the technical depth of your answer.")

        # 2. Speech Clarity & Signal Quality
        speech_metrics = speech_details.get("metrics", {}) if speech_details else {}
        clarity = speech_metrics.get("clarity", "Unknown")
        pace = speech_metrics.get("pace", "Optimal")
        
        if clarity == "Low Quality":
            feedback.append("Significant background noise or low audio volume detected, which may affect automated analysis.")
            suggestions.append("Ensure you are in a quiet environment and using a high-quality microphone for the best results.")
        
        if pace == "Fast":
            feedback.append("Your speaking rate was slightly rapid, which can make complex points harder to follow.")
            suggestions.append("Consciously slow down during key technical segments and use pauses for emphasis.")
        elif pace == "Slow":
            feedback.append("Your delivery was somewhat measured. Aiming for a slightly more dynamic pace could improve conversational engagement.")

        # 3. Prosody & Non-verbal Impact
        prosody = speech_metrics.get("prosody", "Balanced")
        if prosody == "Monotone":
            feedback.append("Your vocal tone was relatively flat. Adding more inflection and emphasis can convey passion and confidence.")
        
        if facial < 0.5:
            feedback.append("Facial engagement appeared limited. Maintaining better eye contact with the camera helps build rapport.")

        # 4. Key Performance Metrics (STAR Hints)
        # Word count correction: if transcript is empty/fallback, word count is 0
        word_count = nlp_metrics.get("word_count", 0 if is_fallback_transcript else len(transcript.split()))
        
        if not is_fallback_transcript:
            if word_count > 40 and nlp > 0.6:
                feedback.append("Good use of the STAR method structure (Situation, Task, Action, Result) detected.")
            elif word_count < 20:
                feedback.append("The response was quite concise. Aim for more detailed explanations in formal settings.")

        # Filler word check
        filler_count = nlp_metrics.get("filler_word_count", 0)
        if filler_count > 4:
            feedback.append(f"Frequent use of filler words ({filler_count}) may impact perceived authority.")
            suggestions.append("Use silent pauses to collect your thoughts instead of vocal fillers like 'um' or 'like'.")

        # Verdict logic
        if is_fallback_transcript:
            verdict = "Technical Difficulty - Transcription Unavailable"
        elif not is_valid:
            verdict = "Non-Responsive - Content did not align with the question."
        elif final > 0.85:
            verdict = "Outstanding - Role-ready delivery and expertise."
        elif final > 0.7:
            verdict = "Professional - Solid industrial standard performance."
        elif final > 0.5:
            verdict = "Developing - Capable, with room for delivery polish."
        else:
            verdict = "Needs Practice - Focus on content structure and clarity."

        return {
            "overall_feedback": " ".join(feedback),
            "verdict": verdict,
            "suggestions": list(set(suggestions))[:4],
            "key_metrics": {
                "word_count": word_count,
                "filler_word_frequency": f"{ (filler_count / max(word_count, 1)) * 10: .2f}",
                "filler_count": filler_count,
                "speaking_rate": pace,
                "clarity_rating": clarity,
                "content_validity": "N/A" if is_fallback_transcript else nlp_metrics.get("content_validity", "Confirmed"),
                "sentiment_profile": "Professional & Balanced" if final > 0.7 else "Developing Clarity"
            }
        }


report_service = ReportService()
