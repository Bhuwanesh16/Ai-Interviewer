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

    def score_relevance(self, question: str, answer: str) -> Dict[str, any]:
        if not answer or len(answer.strip()) < 5:
            return {"nlp_score": 0.0, "metrics": {"filler_words": 0, "length": 0}}
            
        # 1. Semantic Similarity (70% weight)
        if not self.model:
            # Fallback heuristic
            base = min(len(answer) / max(len(question), 1), 2.0)
            semantic_score = max(0.0, min(1.0, 0.5 + (base - 0.5) * 0.25))
        else:
            try:
                # Encode question and answer
                q_emb = self.model.encode(question, convert_to_tensor=True)
                a_emb = self.model.encode(answer, convert_to_tensor=True)
                
                # Compute cosine similarity
                sim = util.cos_sim(q_emb, a_emb).item()
                
                # Map similarity to base score: 
                # e.g., sim=0 -> score=0, sim=0.5 -> score=0.75
                semantic_score = max(0.0, min(1.0, (sim + 0.1) * 1.5))
            except Exception as e:
                logging.error(f"Error computing NLP score: {e}")
                semantic_score = 0.5

        # 2. Filler words (penalty)
        filler_words = {"um", "uh", "actually", "basically", "literally", "like", "you know"}
        words = answer.lower().split()
        filler_count = sum(1 for w in words if w in filler_words)
        # Penalize slightly for frequent filler words
        filler_penalty = min(0.15, (filler_count / max(len(words), 10)) * 0.5)
        
        # 3. Answer Length/Substantiality (30% weight)
        # Aim for 30-100 words (professional depth)
        word_count = len(words)
        if word_count < 15:
            len_score = word_count / 15.0 * 0.6  # Penalize brevity
        elif word_count > 120:
            len_score = 0.8  # Slight penalty for rambling
        else:
            len_score = min(1.0, (word_count / 40.0) + 0.3)
            
        # 4. Professionalism (Avoid common slang or informal tropes)
        informal = {"totally", "super", "kinda", "sorta", "stuff", "things"}
        informal_count = sum(1 for w in words if w in informal)
        informal_penalty = min(0.1, (informal_count / max(len(words), 10)) * 0.3)

        # Final Blend
        final_score = (semantic_score * 0.7) + (len_score * 0.3)
        final_score = max(0.1, min(final_score - filler_penalty - informal_penalty, 1.0))
        
        return {
            "nlp_score": round(float(final_score), 2),
            "metrics": {
                "filler_word_count": filler_count,
                "informal_word_count": informal_count,
                "word_count": word_count,
                "readability_estimate": "Professional" if word_count > 30 else "Limited Detail"
            }
        }

nlp_service = NLPService()
