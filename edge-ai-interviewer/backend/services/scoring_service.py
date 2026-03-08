"""
Scoring service — combines facial, speech, NLP signals into a final score.

Performance note:
- This service is pure computation (<1ms). No changes needed here for speed.
- Dynamic weight redistribution when inputs are None is intentional and correct.
"""

from typing import Dict


class ScoringService:
    def __init__(
        self,
        w_facial: float = 0.35,
        w_speech: float = 0.35,
        w_nlp:    float = 0.30
    ):
        self.w_facial = w_facial
        self.w_speech = w_speech
        self.w_nlp    = w_nlp

    def compute_final_score(
        self,
        facial_score: float,
        speech_score: float,
        nlp_score:    float
    ) -> Dict[str, float]:
        """
        Weighted composite score with dynamic redistribution for None inputs.

        When an input is None (e.g. transcription failed → nlp_score is None),
        its weight is redistributed proportionally across remaining active inputs
        so the final score always occupies the full 0–1 range.

        Returns:
            {
                "final_score":  float,  # weighted composite, rounded to 4dp
                "weights_used": dict    # actual weights after redistribution
            }
        """
        score_inputs = [
            ("facial", facial_score, self.w_facial),
            ("speech", speech_score, self.w_speech),
            ("nlp",    nlp_score,    self.w_nlp),
        ]

        active = [(name, s, w) for name, s, w in score_inputs if s is not None]

        if not active:
            return {
                "final_score":  0.0,
                "weights_used": {"facial": 0, "speech": 0, "nlp": 0}
            }

        total_weight = sum(w for _, _, w in active)
        weighted_sum = sum(s * w for _, s, w in active)

        final_score = weighted_sum / total_weight if total_weight > 0 else 0.0

        weights_used = {
            name: round(w / total_weight, 4) if total_weight > 0 else 0
            for name, _, w in active
        }
        for name, _, _ in score_inputs:
            weights_used.setdefault(name, 0)

        return {
            "final_score":  round(float(final_score), 4),
            "weights_used": weights_used,
        }


scoring_service = ScoringService()