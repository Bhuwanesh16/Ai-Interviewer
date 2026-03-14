"""
NLP service for semantic scoring.

Fixes in this version:

1. EMPTY_TRANSCRIPT_SENTINEL added to fallback_markers — previously "No speech
   detected in the recording." was not in the list, so silent recordings were
   scored as near-zero-word answers (nlp_score ~0.05) instead of returning
   nlp_score=None, causing Content Relevance to show a misleadingly low number
   rather than N/A.

2. Import of EMPTY_TRANSCRIPT_SENTINEL from transcription_service avoids the
   string being duplicated/mismatched between the two modules.

3. Raised filler penalty cap from 0.15 → 0.25 (retained from previous fix).
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

# Import sentinel so both modules share the exact same string constant
try:
    from services.transcription_service import EMPTY_TRANSCRIPT_SENTINEL
except ImportError:
    # Fallback if module path differs — must match transcription_service exactly
    EMPTY_TRANSCRIPT_SENTINEL = "__EMPTY_AUDIO__"


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
        words_5plus = re.findall(r'\b\w{5,}\b', text.lower())
        tech_short = re.findall(
            r'\b(api|test|code|bug|data|user|team|work|design|system|product)\b',
            text.lower()
        )
        stopwords = {"about", "there", "their", "where", "which", "though", "through", "would", "could", "should"}
        combined = [w for w in words_5plus if w not in stopwords] + list(set(tech_short))
        return list(dict.fromkeys(combined))

    def score_relevance(self, question: str, answer: str, skills: str = "") -> Dict[str, any]:
        # FIX: EMPTY_TRANSCRIPT_SENTINEL added — previously silent recordings
        # fell through to scoring instead of returning nlp_score=None (N/A)
        fallback_markers = [
            "Transcription unavailable",
            "(Speech parsing error",
            "(Audio file missing)",
            "openai-whisper not installed",
            "openai-whisper is not installed",
            EMPTY_TRANSCRIPT_SENTINEL,          # <-- fix: silent/empty audio
        ]
        is_fallback = any(marker in (answer or "") for marker in fallback_markers)

        if is_fallback:
            return {
                "nlp_score": None,
                "is_valid": False,
                "metrics": {"reason": "Transcription Failure", "word_count": 0}
            }

        if not answer:
            return {
                "nlp_score": None,
                "is_valid": False,
                "metrics": {"reason": "Insufficient content", "word_count": 0}
            }

        short_answer = len(answer.strip()) < 10

        # 1. Semantic Similarity (45% weight)
        if not self.model:
            base = min(len(answer) / max(len(question), 1), 2.0)
            semantic_score = max(0.0, min(1.0, 0.5 + (base - 0.5) * 0.4))
        else:
            try:
                q_emb = self.model.encode(question, convert_to_tensor=True)
                a_emb = self.model.encode(answer, convert_to_tensor=True)
                sim = util.cos_sim(q_emb, a_emb).item()
                semantic_score = max(0.05, min(1.0, (sim - 0.05) * 2.0)) if sim > 0.05 else 0.05
            except Exception as e:
                logging.error(f"Error computing NLP score: {e}")
                semantic_score = 0.5

        # 2. Keyword Matching (25% weight)
        q_keywords = self._extract_keywords(question)
        a_lower = answer.lower()
        keyword_hits = sum(1 for kw in q_keywords if kw in a_lower)
        keyword_score = min(keyword_hits / max(len(q_keywords), 1), 1.0) if q_keywords else 0.7

        # 3. Content Substantiality (15% weight)
        words = a_lower.split()
        word_count = len(words)
        if word_count < 20:
            substance_score = word_count / 20.0 * 0.4
        elif word_count < 50:
            substance_score = 0.4 + (word_count - 20) / 30.0 * 0.4
        else:
            substance_score = min(1.0, 0.8 + (word_count - 50) / 100.0 * 0.2)

        # 4. Tech Stack Verification (15% weight)
        tech_score = 1.0
        if skills:
            target_skills = [s.strip().lower() for s in skills.split(",") if len(s.strip()) > 1]
            if target_skills:
                hits = sum(1 for s in target_skills if s in a_lower)
                tech_score = min(hits / max(1, len(target_skills) / 2), 1.0)

        # 5. Filler & Professionalism Penalty (cap raised 0.15 → 0.25)
        filler_words = {"um", "uh", "actually", "basically", "literally", "like", "you know", "i mean"}
        filler_count = sum(1 for w in words if w in filler_words)
        filler_penalty = min(0.25, (filler_count / max(word_count, 1)) * 0.5)

        # Final Blend
        final_score = (
            (semantic_score * 0.45) +
            (keyword_score * 0.25) +
            (substance_score * 0.15) +
            (tech_score * 0.15)
        )
        final_score = max(0.05, min(final_score - filler_penalty, 1.0))

        # If the answer is very short, don't force a hard 0.0 — instead
        # produce a conservative but informative score and mark it
        # as not valid. This prevents the UI showing 0/100 which is
        # misleading when the transcript exists but is brief.
        if short_answer:
            final_score = min(final_score, 0.45)

        is_valid = (semantic_score > 0.1 or keyword_score > 0.3) and word_count >= 10

        return {
            "nlp_score": round(float(final_score), 2),
            "is_valid": is_valid,
            "metrics": {
                "filler_word_count": filler_count,
                "keyword_match_ratio": round(keyword_score, 2),
                "tech_alignment": round(tech_score, 2),
                "word_count": word_count,
                "professionalism_level": "High" if filler_penalty < 0.05 else "Standard" if filler_penalty < 0.12 else "Casual",
                "content_validity": "Confirmed" if is_valid else "Weak/Unrelated"
            }
        }


nlp_service = NLPService()