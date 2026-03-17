"""
Scoring service — combines facial, speech, NLP signals into a final score.

Weight rationale (v3):
  NLP   40%: Content quality is the strongest signal of competence.
  Speech 30%: Clarity, pace and prosody reflect communication skill.
  Facial 30%: Presence, eye-contact and engagement are secondary but real.

Dynamic redistribution: when an input is None (e.g. transcription failed),
its weight is shared proportionally across remaining active signals so the
final score stays in the full 0–1 range.
"""

from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

# Heuristic-placeholder NLP cap — when the transcript is a fallback string
# ("The candidate provided a verbal response...") we don't want that to
# inflate the NLP score to realistic levels. Cap it at 0.35.
HEURISTIC_NLP_CAP = 0.35


class ScoringService:
    def __init__(
        self,
        w_facial: float = 0.30,   # was 0.35
        w_speech: float = 0.30,   # was 0.35
        w_nlp:    float = 0.40,   # was 0.30 — NLP is strongest signal
    ):
        self.w_facial = w_facial
        self.w_speech = w_speech
        self.w_nlp    = w_nlp

    def compute_final_score(
        self,
        facial_score: Optional[float],
        speech_score: Optional[float],
        nlp_score:    Optional[float],
        is_heuristic_transcript: bool = False,
    ) -> Dict[str, float]:
        """
        Weighted composite score with dynamic redistribution for None inputs.

        Args:
            facial_score: 0..1 or None
            speech_score: 0..1 or None
            nlp_score:    0..1 or None
            is_heuristic_transcript: True when the transcript is a placeholder —
                caps nlp_score to HEURISTIC_NLP_CAP so a fake transcript
                does not produce an inflated content score.

        Returns:
            {
                "final_score":  float,  # weighted composite, clamped + rounded
                "weights_used": dict    # actual weights after redistribution
            }
        """
        # Clamp individual inputs to valid range
        def _clamp(v):
            if v is None:
                return None
            try:
                return max(0.0, min(float(v), 1.0))
            except (TypeError, ValueError):
                return None

        facial_score = _clamp(facial_score)
        speech_score = _clamp(speech_score)
        nlp_score    = _clamp(nlp_score)

        # Cap NLP when transcript is a heuristic placeholder
        if is_heuristic_transcript and nlp_score is not None:
            nlp_score = min(nlp_score, HEURISTIC_NLP_CAP)
            logger.debug(f"[scoring] Heuristic transcript detected — NLP score capped at {HEURISTIC_NLP_CAP}")

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
        # Hard floor: 0.05 so we never store a perfect zero
        final_score = max(0.05, min(final_score, 1.0))

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