"""
Report generation service.

Generates detailed, professional feedback and actionable suggestions 
based on scores (facial, speech, NLP) and semantic analysis of the transcript.
"""

from typing import Dict, List


class ReportService:
    def generate_feedback(self, scores: Dict[str, float], transcript: str, speech_details: Dict[str, any] = None) -> Dict[str, any]:
        facial = scores.get("facial", 0)
        speech = scores.get("speech", 0)
        nlp = scores.get("nlp", 0)
        final = scores.get("final", 0)

        feedback = []
        suggestions = []

        # 1. Facial Analysis Feedback (Visual Impact)
        if facial >= 0.8:
            feedback.append("Excellent non-verbal engagement. Your facial expressions were natural, conveying confidence and openness.")
        elif facial >= 0.6:
            feedback.append("Good non-verbal presence. Maintaining a more consistent smile and steady eye contact with the lens could further enhance your perceived confidence.")
        else:
            feedback.append("Non-verbal cues could be improved. Try to maintain consistent eye contact and use more expressive cues to appear more engaged with the interviewer.")
            suggestions.append("Practice mirroring high-energy responses to see how your facial expressions change with your vocal tone.")

        # 2. Speech Analysis Feedback (Delivery & Pace)
        # Using speech_details if available (from speech_service)
        rate = speech_details.get("rate_per_sec", 3.0) if speech_details else 3.0
        
        if speech >= 0.8:
            feedback.append(f"Outstanding vocal delivery at a professional pace (approx {rate:.1f} syllables/sec). Your enunciation was crisp and authoritative.")
        elif speech >= 0.6:
            feedback.append("Clear vocal delivery. Be mindful of occasional variations in pace to ensure maximum clarity, especially during complex technical explanations.")
        else:
            feedback.append("Vocal delivery was slightly inconsistent. Focus on maintaining a steady speaking rate and articulate more clearly to reduce listener effort.")
            suggestions.append("Record yourself and aim for 130-150 words per minute, which is the 'sweet spot' for professional presentations.")

        # 3. NLP Analysis Feedback (Content & Logic)
        if nlp >= 0.8:
            feedback.append("Strong content relevance. Your response directly addressed the core requirements with specific, high-impact details.")
        elif nlp >= 0.6:
            feedback.append("Meaningful response. Strengthening the 'Action' and 'Result' sections using the STAR method would make your impact more quantifiable.")
        else:
            feedback.append("Content relevance could be strengthened. Ensure you directly address the prompt and use specific technical terminology related to the role.")
            suggestions.append("Use the STAR (Situation, Task, Action, Result) method to provide structured answers that highlight your specific contributions.")

        # 4. Transcipt Depth & Filler Words
        words = transcript.lower().split()
        word_count = len(words)
        
        if word_count < 20:
            feedback.append("The response was quite brief. Consider providing more context or detail to fully demonstrate your expertise and thought process.")
        
        filler_words = {"um", "uh", "actually", "basically", "literally", "like", "you know"}
        filler_count = sum(1 for word in words if word in filler_words or any(f in word for f in ["...hum", "...uh"]))
        
        if filler_count > 3:
            freq = (filler_count / max(word_count, 1)) * 100
            feedback.append(f"Frequent use of filler words detected (approx {freq:.1f}% frequency). This can diminish your perceived authority.")
            suggestions.append("Pause intentionally (1-2 seconds) instead of using filler words when you need to gather your thoughts.")

        # Final Overall Verdict
        if final > 0.85:
            verdict = "Outstanding - Highly professional delivery with strong content."
        elif final > 0.7:
            verdict = "Professional - Solid performance with minor room for refinement."
        elif final > 0.5:
            verdict = "Developing - Good foundation, focusing on delivery consistency is key."
        else:
            verdict = "Foundational - Focus on structuring responses and practicing vocal clarity."

        return {
            "overall_feedback": " ".join(feedback),
            "verdict": verdict,
            "suggestions": list(set(suggestions))[:4],  # Ensure unique and limit to 4
            "key_metrics": {
                "word_count": word_count,
                "filler_word_frequency": f"{ (filler_count / max(word_count, 1)) * 10: .2f}", # Adjusted for display
                "filler_count": filler_count,
                "speaking_rate": "Optimal" if 2.0 <= rate <= 4.0 else "Varies",
                "sentiment_profile": "Professional & Balanced" if final > 0.7 else "Developing Clarity"
            }
        }


report_service = ReportService()
