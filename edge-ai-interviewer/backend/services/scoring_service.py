"""
Scoring service that combines signals from facial, speech, and NLP analysis.
"""

from typing import Dict


class ScoringService:
    def __init__(self, w_facial: float = 0.3, w_speech: float = 0.3, w_nlp: float = 0.4):
        self.w_facial = w_facial
        self.w_speech = w_speech
        self.w_nlp = w_nlp

    def compute_final_score(
        self, facial_score: float, speech_score: float, nlp_score: float
    ) -> Dict[str, float]:
        final_score = (
            self.w_facial * facial_score
            + self.w_speech * speech_score
            + self.w_nlp * nlp_score
        )
        return {"final_score": final_score}


scoring_service = ScoringService()

