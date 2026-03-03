"""
NLP service for semantic scoring.

Uses SentenceTransformers to compute semantic similarity between the question 
and the applicant's transcribed answer.
"""

import re
from typing import Dict, List
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

    def _extract_keywords(self, text: str) -> List[str]:
        # Simple extraction of significant words (length > 4, no stopwords)
        words = re.findall(r'\b\w{5,}\b', text.lower())
        stopwords = {"about", "there", "their", "where", "which", "though", "through"}
        return [w for w in words if w not in stopwords]

    def score_relevance(self, question: str, answer: str) -> Dict[str, any]:
        is_fallback = any(x in answer for x in ["Transcription unavailable", "(Speech parsing error", "(Audio file missing)"])
        
        if not answer or len(answer.strip()) < 10 or is_fallback:
            return {
                "nlp_score": 0.0, 
                "is_valid": False, 
                "metrics": {"reason": "Insufficient content", "word_count": 0}
            }
            
        # 1. Semantic Similarity (60% weight)
        if not self.model:
            base = min(len(answer) / max(len(question), 1), 2.0)
            semantic_score = max(0.0, min(1.0, 0.5 + (base - 0.5) * 0.25))
        else:
            try:
                q_emb = self.model.encode(question, convert_to_tensor=True)
                a_emb = self.model.encode(answer, convert_to_tensor=True)
                sim = util.cos_sim(q_emb, a_emb).item()
                # Industrial validation: sim < 0.15 usually means completely unrelated
                semantic_score = max(0.0, min(1.0, (sim - 0.1) * 1.6)) if sim > 0.1 else 0.0
            except Exception as e:
                logging.error(f"Error computing NLP score: {e}")
                semantic_score = 0.5

        # 2. Keyword Matching (20% weight)
        q_keywords = self._extract_keywords(question)
        a_words = answer.lower()
        keyword_hits = sum(1 for kw in q_keywords if kw in a_words)
        keyword_score = min(keyword_hits / max(len(q_keywords), 1), 1.0) if q_keywords else 1.0

        # 3. Filler & Professionalism Penalty
        filler_words = {"um", "uh", "actually", "basically", "literally", "like", "you know", "i mean"}
        informal = {"totally", "super", "kinda", "sorta", "stuff", "things", "etc"}
        
        words = answer.lower().split()
        word_count = len(words)
        filler_count = sum(1 for w in words if w in filler_words)
        informal_count = sum(1 for w in words if w in informal)
        
        filler_penalty = min(0.15, (filler_count / max(word_count, 10)) * 0.6)
        informal_penalty = min(0.1, (informal_count / max(word_count, 10)) * 0.4)

        # 4. Content Substantiality (20% weight)
        if word_count < 25:
            len_score = word_count / 25.0 * 0.7
        else:
            len_score = min(1.0, (word_count / 80.0) + 0.3)

        # Final Blend
        final_score = (semantic_score * 0.6) + (keyword_score * 0.2) + (len_score * 0.2)
        final_score = max(0.05, min(final_score - filler_penalty - informal_penalty, 1.0))
        
        # Validation Check
        is_valid = semantic_score > 0.1 and word_count > 12

        return {
            "nlp_score": round(float(final_score), 2),
            "is_valid": is_valid,
            "metrics": {
                "filler_word_count": filler_count,
                "keyword_match_ratio": round(keyword_score, 2),
                "word_count": word_count,
                "professionalism_level": "High" if informal_penalty < 0.02 else "Standard" if informal_penalty < 0.05 else "Casual",
                "content_validity": "Confirmed" if is_valid else "Weak/Unrelated"
            }
        }

nlp_service = NLPService()
