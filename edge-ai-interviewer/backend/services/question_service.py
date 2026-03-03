"""
Question generation service for InterviewAI using local LLaMA (Ollama).

Returns a plain Python list of question strings. The LLM output format is:
  Q1: <question>
  Q2: <question>
  ...
which is parsed into a clean list before returning. If Ollama is unavailable,
a role/level-aware static bank is used instead.
"""

import re
import random
import requests
import logging

OLLAMA_URL = "http://localhost:11434/api/generate"

MASTER_PROMPT = """
You are InterviewAI, an industrial-grade AI assessment engine operating in a fully local edge environment.
Your role is to generate professional technical interview questions tailored to the candidate's configuration.
You must behave like a senior engineering interviewer from a high-performance technology company.
Do not provide answers.
Do not explain anything.
Do not provide feedback.
Only generate questions as instructed.
Maintain strict professional tone.
Avoid generic or textbook definition-based questions.
Focus on real-world application, system thinking, optimization, and engineering trade-offs.
"""

DYNAMIC_PROMPT_TEMPLATE = """
Interview Configuration:
- Target Role: {role}
- Experience Tier: {experience}
- Core Competencies: {skills}
- Question Volume: {question_volume}

Generation Rules:
- Adjust difficulty based on experience tier.
- Entry Level → implementation-focused, learning-oriented.
- Intermediate → design + optimization + trade-offs.
- Senior → architecture + scalability + failure handling.
- Lead/Manager → leadership, team dynamics, cross-functional strategy.
- Cover different competencies across questions.
- Avoid repeating topics.
- Questions must test conceptual depth.
- Keep each question under 35 words.
- Label each question exactly as Q1, Q2, Q3, etc. followed by a colon.
- Do not include answers or explanations.
- Reject vague questions like "What is React?" or "Explain Python."
- Questions should reflect real problems encountered in production systems.

Output Format (STRICT — follow exactly):
Q1: <question>
Q2: <question>
Q3: <question>
"""

FOLLOWUP_PROMPT_TEMPLATE = """
Live Interview Context:
- Role: {role}
- Experience: {experience}
- Previous Question: {previous_question}
- Candidate Answer: {candidate_answer}

Your task:
- If the answer is strong → generate a deeper follow-up question.
- If the answer is partial → generate a clarification question.
- If the answer is weak → generate a foundational probing question.

Rules:
- Ask only ONE question.
- No feedback.
- No explanation.
- Keep it professional.
- Make it context-aware.

Output Format:
Follow-up: <question>
"""

FEEDBACK_PROMPT_TEMPLATE = """
Interview Evaluator Mode:
Evaluate the following interview response like a senior engineering lead. 
Provide a concise, professional, and actionable assessment.

Context:
- Role: {role}
- Experience: {experience}
- Question Asked: {question}
- Candidate Answer: {transcript}
- Metric Scores: Facial={facial_score}, Speech={speech_score}, Content={nlp_score}

Your Evaluation Rules:
1. Write 2-3 sentences of direct, supportive yet firm professional feedback.
2. Focus on the substance of the answer and the delivery.
3. Be specific to the role and seniority level.
4. Do not mention the numerical scores directly; use qualitative descriptors.
5. Provide 3 specific, bulleted technical improvements or "Next Steps".

Output Format:
Feedback: <Your paragraph assessment>
Improvements:
- <Improvement 1>
- <Improvement 2>
- <Improvement 3>
"""

# ---------------------------------------------------------------------------
# Role/level-aware fallback question banks (used when Ollama is unreachable)
# ---------------------------------------------------------------------------

FALLBACK_BANKS = {
    "entry level": [
        "Walk me through a personal project you've built from scratch.",
        "What motivates you to pursue a career in this field?",
        "Describe a time you learned a new technology quickly under constraint.",
        "How do you approach debugging unfamiliar code? Walk me through your process.",
        "What technical concept did you recently master? Explain it as if teaching a peer.",
        "How do you prioritize when you have multiple deadlines at once?",
        "Describe a mistake you made in a project and what you learned from it.",
    ],
    "intermediate": [
        "Describe a critical production bug you diagnosed and resolved. What was your RCA process?",
        "How do you balance technical debt reduction with feature delivery speed?",
        "Walk me through a design decision you later regretted. What would you do differently?",
        "How do you ensure consistent code quality in a fast-moving development team?",
        "Explain your approach to API design. What principles drive your decisions?",
        "How have you handled a major scope change mid-sprint? What was the outcome?",
        "Describe a time you had to optimize a slow database query in production.",
    ],
    "senior": [
        "How do you architect systems to be resilient to third-party service failures?",
        "Describe a time you significantly influenced engineering culture in a positive way.",
        "How do you handle fundamental architectural disagreements within a senior team?",
        "What trade-offs do you evaluate when choosing between microservices and a monolith?",
        "How do you balance long-term architectural integrity with short-term business deadlines?",
        "Describe your approach to designing a distributed system that must guarantee consistency.",
        "How do you handle the onboarding of a completely new technology stack under a deadline?",
    ],
    "lead / manager": [
        "How do you manage a team member consistently missing sprint commitments?",
        "Describe how you set technical strategy aligned with business objectives.",
        "How do you build psychological safety while maintaining high engineering standards?",
        "Walk me through how you'd run a post-mortem after a major production incident.",
        "How do you mentor senior engineers who are resistant to feedback?",
        "How would you handle a conflict between two senior engineers with opposing technical views?",
        "Describe a time you had to make an unpopular technical decision. How did you communicate it?",
    ],
}

GENERIC_FALLBACK = [
    "Tell me about your most challenging technical project and your specific contributions.",
    "How do you approach learning new technologies in your domain?",
    "Describe a situation where you had to make a technical trade-off. What drove your decision?",
    "How do you communicate complex technical decisions to non-technical stakeholders?",
    "What is the most impactful optimization you've made in a production system?",
]


def _parse_questions(raw: str, n: int, role: str = "Engineer") -> list:
    """
    Parse the LLM output into a clean list of question strings.

    The LLM is instructed to produce:
        Q1: <question>
        Q2: <question>

    This parser is tolerant of minor formatting deviations.
    """
    if isinstance(raw, list):
        # already a list (returned by fallback path)
        return [q for q in raw if isinstance(q, str) and len(q.strip()) > 5][:n]

    questions = []
    lines = str(raw).strip().splitlines()

    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Match "Q1:", "Q1.", "1.", "1)" etc. at the start
        match = re.match(r'^(?:Q\d+[:.]\s*|Follow-up[:.]\s*|\d+[.)]\s*)(.+)', line, re.IGNORECASE)
        if match:
            q = match.group(1).strip()
            if len(q) > 10:
                questions.append(q)

    # Fallback: if regex found nothing, treat any non-trivial line as a question
    if not questions:
        questions = [l.strip() for l in lines if len(l.strip()) > 20]

    return questions[:n] if questions else [f"Tell me about your experience as a {role}."]


def _get_fallback(experience: str, n: int) -> list:
    """Return n questions from the appropriate level's bank."""
    key = experience.lower().strip()
    bank = FALLBACK_BANKS.get(key, GENERIC_FALLBACK)
    shuffled = bank.copy()
    random.shuffle(shuffled)
    # pad if needed
    while len(shuffled) < n:
        shuffled += bank
    return shuffled[:n]


def generate_questions(role: str, experience: str, skills: str, question_volume: int) -> list:
    """
    Generate interview questions via the local Ollama service.

    Returns a Python list of question strings (never raw LLM text).
    Falls back to a role/level-aware static bank if Ollama is unavailable.
    """
    question_volume = max(1, int(question_volume))

    prompt = MASTER_PROMPT + "\n" + DYNAMIC_PROMPT_TEMPLATE.format(
        role=role,
        experience=experience,
        skills=skills if skills else "General engineering skills",
        question_volume=question_volume,
    )

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": "llama3",
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 512,
                },
            },
            timeout=60,  # LLM can be slow on first load
        )
        response.raise_for_status()
        raw = response.json().get("response", "")
        questions = _parse_questions(raw, question_volume, role)
        if questions:
            logging.info(f"LLM generated {len(questions)} questions for {role} ({experience})")
            return questions
        else:
            logging.warning("LLM returned empty/unparseable output; using fallback.")
            return _get_fallback(experience, question_volume)

    except requests.exceptions.RequestException as exc:
        logging.warning(f"LLM question generation failed ({exc}); using fallback bank.")
        return _get_fallback(experience, question_volume)


def generate_followup(role: str, experience: str, previous_question: str, candidate_answer: str) -> str:
    """
    Ask the LLM for a context-aware follow-up question.
    Falls back to a generic elaboration prompt if Ollama is unavailable.
    """
    prompt = MASTER_PROMPT + "\n" + FOLLOWUP_PROMPT_TEMPLATE.format(
        role=role,
        experience=experience,
        previous_question=previous_question,
        candidate_answer=candidate_answer,
    )
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": "llama3",
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.65, "num_predict": 150},
            },
            timeout=30,
        )
        response.raise_for_status()
        raw = response.json().get("response", "")
        # Strip the "Follow-up:" prefix if present
        cleaned = re.sub(r'^Follow-up[:.]\s*', '', raw.strip(), flags=re.IGNORECASE)
        return cleaned if cleaned else f"Can you elaborate more on: '{previous_question}'?"
    except requests.exceptions.RequestException as exc:
        logging.warning(f"LLM follow-up generation failed ({exc}); returning generic fallback.")
        return f"Can you elaborate more on: '{previous_question}'?"


def generate_ai_feedback(role, experience, question, transcript, scores):
    """Generates professional AI feedback for a specific answer."""
    prompt = MASTER_PROMPT + "\n" + FEEDBACK_PROMPT_TEMPLATE.format(
        role=role,
        experience=experience,
        question=question,
        transcript=transcript,
        facial_score=scores.get("facial", 0),
        speech_score=scores.get("speech", 0),
        nlp_score=scores.get("nlp", 0)
    )
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": "llama3",
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.5, "num_predict": 400},
            },
            timeout=30,
        )
        response.raise_for_status()
        raw = response.json().get("response", "")
        
        # Parse output
        feedback_match = re.search(r'Feedback:\s*(.*?)(?=Improvements:|$)', raw, re.DOTALL | re.IGNORECASE)
        improvements_match = re.search(r'Improvements:\s*(.*)', raw, re.DOTALL | re.IGNORECASE)
        
        feedback = feedback_match.group(1).strip() if feedback_match else ""
        improvements_raw = improvements_match.group(1).strip() if improvements_match else ""
        
        # Clean bullets
        suggestions = [re.sub(r'^[-*•\s\d.]+', '', line).strip() for line in improvements_raw.splitlines() if line.strip()]
        
        return {
            "feedback": feedback,
            "suggestions": suggestions[:3]
        }
    except Exception as exc:
        logging.warning(f"LLM feedback generation failed ({exc})")
        return None
