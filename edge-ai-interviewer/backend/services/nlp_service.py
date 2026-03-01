"""
NLP service for semantic scoring.

Uses SentenceTransformers to compute semantic similarity between the question 
and the applicant's transcribed answer.
"""

from typing import Dict
import logging

try:
    from sentence_transformers import SentenceTransformer, util
    ST_AVAILABLE = True
except ImportError:
    ST_AVAILABLE = False
    logging.warning("sentence-transformers not installed. NLP will fallback to length heuristic.")

class NLPService:
    def __init__(self):
        self._loaded = ST_AVAILABLE
        self.model = None
        if ST_AVAILABLE:
            try:
                logging.info("Loading all-MiniLM-L6-v2 for semantic similarity...")
                self.model = SentenceTransformer("all-MiniLM-L6-v2")
                logging.info("NLP model loaded.")
            except Exception as e:
                logging.error(f"Failed to load sentence_transformers: {e}")
                self.model = None

    def score_relevance(self, question: str, answer: str) -> Dict[str, float]:
        if not answer or len(answer.strip()) < 5:
            return {"nlp_score": 0.0}
            
        if not self.model:
            # Fallback heuristic
            base = min(len(answer) / max(len(question), 1), 2.0)
            score = max(0.0, min(1.0, 0.5 + (base - 0.5) * 0.25))
            return {"nlp_score": round(float(score), 2)}
            
        try:
            # Encode question and answer
            q_emb = self.model.encode(question, convert_to_tensor=True)
            a_emb = self.model.encode(answer, convert_to_tensor=True)
            
            # Compute cosine similarity
            sim = util.cos_sim(q_emb, a_emb).item()
            
            # Map similarity to base score: 
            # e.g., sim=0 -> score=0, sim=0.5 -> score=0.75
            score = max(0.0, min(1.0, (sim + 0.1) * 1.5))
            
            # Additional heuristic: length/detail
            words = answer.split()
            length_factor = min(len(words) / 30.0, 1.0)
            
            # Final blend: 70% semantic relevance, 30% answer substantiality
            final_score = (score * 0.7) + (length_factor * 0.3)
            final_score = max(0.1, min(final_score, 1.0))
            
            return {"nlp_score": round(float(final_score), 2)}
            
        except Exception as e:
            logging.error(f"Error computing NLP score: {e}")
            return {"nlp_score": 0.5}

nlp_service = NLPService()
