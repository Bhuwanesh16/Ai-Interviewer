"""
NLP service for semantic scoring.

Typical implementation:
- encode question and answer with a sentence embedding model
- compute cosine similarity for relevance / coherence
"""

from typing import Dict


class NLPService:
    def __init__(self):
        # TODO: load sentence embedding / transformer model here
        self._loaded = True

    def score_relevance(self, question: str, answer: str) -> Dict[str, float]:
        # Placeholder: simple heuristic based on length
        base = min(len(answer) / max(len(question), 1), 2.0)
        score = max(0.0, min(1.0, 0.5 + (base - 0.5) * 0.25))
        return {"nlp_score": score}


nlp_service = NLPService()

