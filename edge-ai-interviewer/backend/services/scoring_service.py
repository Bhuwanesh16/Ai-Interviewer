"""
Scoring service that combines signals from facial, speech, and NLP analysis.
"""

from typing import Dict


class ScoringService:
    def __init__(self, w_facial: float = 0.35, w_speech: float = 0.35, w_nlp: float = 0.30):
        self.w_facial = w_facial
        self.w_speech = w_speech
        self.w_nlp = w_nlp

    def compute_final_score(
        self, facial_score: float, speech_score: float, nlp_score: float
    ) -> Dict[str, float]:
        """
        Compute final score with dynamic weighting if one or more inputs are None.

        If any of the input scores (facial_score, speech_score, nlp_score) are None,
        their corresponding weights are redistributed proportionally among the remaining
        scores. For example, if nlp_score is None, the weights for facial_score and
        speech_score are adjusted to maintain a total weight of 1.0.

        Args:
            facial_score (float): Score from facial analysis (0.0 to 1.0).
            speech_score (float): Score from speech analysis (0.0 to 1.0).
            nlp_score (float): Score from NLP analysis (0.0 to 1.0).

        Returns:
            Dict[str, float]: A dictionary containing the final_score, rounded to 4 decimal places.
        """
        score_inputs = [
            (facial_score, self.w_facial),
            (speech_score, self.w_speech),
            (nlp_score, self.w_nlp)
        ]
        
        # Filter out None values
        active_scores = [(s, w) for s, w in score_inputs if s is not None]
        
        if not active_scores:
            return {"final_score": 0.0}
            
        total_weight = sum(w for s, w in active_scores)
        weighted_sum = sum(s * w for s, w in active_scores)
        
        # Normalize sum by total active weight to redistribute the missing signal's weight
        final_score = weighted_sum / total_weight if total_weight > 0 else 0.0
        
        return {"final_score": round(float(final_score), 4)}


scoring_service = ScoringService()

