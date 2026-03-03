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

CRITICAL: Generate questions SPECIFICALLY for the Target Role "{role}". 
Roles include: Software Engineer, Frontend Developer, Backend Developer, Full Stack Developer, 
Data Scientist, Machine Learning Engineer, DevOps Engineer, Product Manager, UI/UX Designer, 
QA Engineer, Cyber Security Analyst. Tailor each question to the domain and responsibilities of this role.

Generation Rules:
- Adjust difficulty based on experience tier.
- Entry Level → implementation-focused, learning-oriented, hands-on.
- Intermediate → design + optimization + trade-offs, real-world scenarios.
- Senior → architecture + scalability + failure handling, system thinking.
- Lead/Manager → leadership, team dynamics, cross-functional strategy.
- Use Core Competencies ({skills}) to add domain-specific angles where relevant.
- Cover different competencies across questions. Avoid repeating topics.
- Questions must test conceptual depth and real problems in production/industry.
- Keep each question under 35 words.
- Label each question exactly as Q1, Q2, Q3, etc. followed by a colon.
- Do not include answers or explanations.
- Reject vague definition questions like "What is React?" or "Explain Python."
- Questions should reflect real problems encountered in the role's day-to-day work.

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
# Roles match the Interview Configuration dropdown: Software Engineer, Frontend, Backend, etc.
# ---------------------------------------------------------------------------

def _level_bank(entry: list, intermediate: list, senior: list, lead: list) -> dict:
    return {"entry level": entry, "intermediate": intermediate, "senior": senior, "lead / manager": lead}

ROLE_FALLBACK_BANKS = {
    "Software Engineer": _level_bank(
        ["Walk me through a personal project you've built from scratch.", "How do you approach debugging unfamiliar code?", "Describe a time you learned a new technology quickly.", "What technical concept did you recently master? Explain it to a peer."],
        ["Describe a critical production bug you diagnosed and resolved. What was your RCA process?", "How do you balance technical debt reduction with feature delivery?", "Explain your approach to API design. What principles drive your decisions?", "How have you handled a major scope change mid-sprint?"],
        ["How do you architect systems to be resilient to third-party service failures?", "What trade-offs do you evaluate when choosing between microservices and a monolith?", "Describe your approach to designing a distributed system that must guarantee consistency."],
        ["How do you manage a team member consistently missing sprint commitments?", "Describe how you set technical strategy aligned with business objectives.", "Walk me through how you'd run a post-mortem after a major production incident."],
    ),
    "Frontend Developer": _level_bank(
        ["Describe a React or Vue component you built and how you managed its state.", "How do you ensure your UI is accessible and responsive?", "Walk me through a time you fixed a tricky CSS or layout issue."],
        ["How do you optimize frontend performance for slow networks or large bundles?", "Describe your approach to component architecture and reusability.", "How do you handle state management in a complex SPA? What patterns do you use?"],
        ["How would you design a frontend architecture for a multi-team monorepo?", "What trade-offs do you consider when choosing between SSR and CSR?", "How do you ensure consistent UX across browsers and devices at scale?"],
        ["How do you mentor junior frontend developers on best practices?", "How do you align frontend roadmap with product and design priorities?"],
    ),
    "Backend Developer": _level_bank(
        ["Walk me through an API you designed. What considerations did you have?", "Describe a time you optimized a slow database query.", "How do you handle errors and logging in backend services?"],
        ["How do you design APIs for high concurrency and low latency?", "Describe your approach to database schema design and migrations.", "How do you ensure backward compatibility when evolving APIs?"],
        ["How do you design systems to be resilient to third-party failures?", "What trade-offs do you evaluate when choosing between SQL and NoSQL?", "Describe your approach to event-driven or message-based architectures."],
        ["How do you set technical standards for backend services across teams?", "Walk me through how you'd run a post-mortem for a production outage."],
    ),
    "Full Stack Developer": _level_bank(
        ["Describe a full-stack feature you shipped end-to-end. What was your process?", "How do you split work between frontend and backend when building a feature?"],
        ["How do you maintain consistency between frontend and backend contracts?", "Describe a time you had to optimize both client and server performance.", "How do you choose which logic lives on the client vs the server?"],
        ["How would you design a full-stack architecture for a real-time collaborative app?", "What trade-offs do you consider when building isomorphic or SSR applications?"],
        ["How do you mentor full-stack developers across the entire stack?", "How do you balance feature velocity with technical quality across the stack?"],
    ),
    "Data Scientist": _level_bank(
        ["Describe a data analysis project you completed. What was your approach?", "How do you validate that your model or analysis is correct?", "Walk me through a time you cleaned or preprocessed messy data."],
        ["How do you choose between different modeling approaches for a given problem?", "Describe a time you communicated complex results to non-technical stakeholders.", "How do you handle imbalanced or missing data in your pipeline?"],
        ["How would you design an ML pipeline for production at scale?", "What trade-offs do you evaluate when selecting features or models?", "How do you ensure model fairness and interpretability?"],
        ["How do you align data science roadmap with business KPIs?", "How do you mentor data scientists on best practices and reproducibility?"],
    ),
    "Machine Learning Engineer": _level_bank(
        ["Describe an ML model you trained and deployed. What was your workflow?", "How do you debug a model that underperforms in production?", "Walk me through how you version datasets and models."],
        ["How do you optimize model inference latency for real-time use cases?", "Describe your approach to A/B testing model changes in production.", "How do you handle data drift and model retraining?"],
        ["How would you design an ML platform for multiple teams and models?", "What trade-offs do you consider when choosing between batch and real-time inference?", "How do you ensure reproducibility and auditability of ML pipelines?"],
        ["How do you set ML engineering standards across the organization?", "How do you balance experimentation speed with production stability?"],
    ),
    "DevOps Engineer": _level_bank(
        ["Describe a CI/CD pipeline you built or improved. What was your role?", "How do you troubleshoot a service that's slow or failing in production?", "Walk me through your approach to configuration management."],
        ["How do you design infrastructure for high availability and disaster recovery?", "Describe your approach to monitoring and alerting. What do you measure?", "How do you manage secrets and security in deployment pipelines?"],
        ["How would you design a multi-region deployment strategy?", "What trade-offs do you consider when choosing between Kubernetes and simpler orchestration?", "How do you balance infrastructure cost with performance and reliability?"],
        ["How do you lead incident response and post-mortem culture?", "How do you align DevOps practices with development and product teams?"],
    ),
    "Product Manager": _level_bank(
        ["Describe a product decision you made based on user feedback. What was the outcome?", "How do you prioritize features when resources are limited?", "Walk me through how you define success metrics for a feature."],
        ["How do you balance stakeholder requests with product strategy?", "Describe a time you had to deprioritize a feature. How did you communicate it?", "How do you work with engineering to scope and ship on time?"],
        ["How do you drive product strategy in a competitive market?", "What trade-offs do you make when balancing innovation with technical debt?", "How do you align roadmaps across multiple teams or product lines?"],
        ["How do you mentor product managers and build product culture?", "How do you handle conflict between product vision and engineering constraints?"],
    ),
    "UI/UX Designer": _level_bank(
        ["Walk me through a design project from research to final deliverable.", "How do you incorporate user feedback into your designs?", "Describe a time you simplified a complex user flow."],
        ["How do you balance user needs with business goals and technical constraints?", "Describe your approach to design systems and component libraries.", "How do you measure the success of a design change?"],
        ["How would you lead design for a new product from scratch?", "What trade-offs do you consider when choosing between consistency and innovation?", "How do you ensure accessibility and inclusion in your designs?"],
        ["How do you mentor designers and foster design maturity in the org?", "How do you align design vision with engineering and product?"],
    ),
    "QA Engineer": _level_bank(
        ["Describe your testing strategy for a recent feature. What did you cover?", "How do you decide when to automate vs manually test?", "Walk me through a bug you found that was hard to reproduce."],
        ["How do you design test cases for complex or legacy systems?", "Describe your approach to regression testing and release criteria.", "How do you work with developers to improve testability?"],
        ["How would you design a QA strategy for a new product or platform?", "What trade-offs do you consider when choosing test automation frameworks?", "How do you balance coverage with test maintenance cost?"],
        ["How do you lead quality initiatives across engineering teams?", "How do you align QA metrics with product and business goals?"],
    ),
    "Cyber Security Analyst": _level_bank(
        ["Describe a security assessment or audit you performed. What did you find?", "How do you stay updated on emerging threats and vulnerabilities?", "Walk me through how you'd respond to a suspected breach."],
        ["How do you prioritize remediation when multiple vulnerabilities are found?", "Describe your approach to penetration testing or red team exercises.", "How do you communicate security risks to non-technical stakeholders?"],
        ["How would you design a security program for a growing company?", "What trade-offs do you consider when balancing security with usability?", "How do you ensure compliance and audit readiness?"],
        ["How do you build security culture across engineering and operations?", "How do you align security initiatives with business priorities?"],
    ),
}

FALLBACK_BANKS = {
    "entry level": [
        "Walk me through a personal project you've built from scratch.",
        "What motivates you to pursue a career in this field?",
        "Describe a time you learned a new technology quickly under constraint.",
        "How do you approach debugging unfamiliar code? Walk me through your process.",
    ],
    "intermediate": [
        "Describe a critical production bug you diagnosed and resolved. What was your RCA process?",
        "How do you balance technical debt reduction with feature delivery speed?",
        "Explain your approach to API design. What principles drive your decisions?",
    ],
    "senior": [
        "How do you architect systems to be resilient to third-party service failures?",
        "What trade-offs do you evaluate when choosing between microservices and a monolith?",
    ],
    "lead / manager": [
        "How do you manage a team member consistently missing sprint commitments?",
        "Describe how you set technical strategy aligned with business objectives.",
    ],
}

GENERIC_FALLBACK = [
    "Tell me about your most challenging technical project and your specific contributions.",
    "How do you approach learning new technologies in your domain?",
    "Describe a situation where you had to make a technical trade-off. What drove your decision?",
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


def _get_fallback(experience: str, n: int, role: str = "Software Engineer") -> list:
    """Return n questions from the role- and level-appropriate bank."""
    level_key = experience.lower().strip()
    # Try role-specific bank first
    role_banks = ROLE_FALLBACK_BANKS.get(role, ROLE_FALLBACK_BANKS.get("Software Engineer"))
    if isinstance(role_banks, dict):
        bank = role_banks.get(level_key, FALLBACK_BANKS.get(level_key, GENERIC_FALLBACK))
    else:
        bank = FALLBACK_BANKS.get(level_key, GENERIC_FALLBACK)
    shuffled = bank.copy() if isinstance(bank, list) else []
    random.shuffle(shuffled)
    while len(shuffled) < n:
        shuffled += bank if isinstance(bank, list) else GENERIC_FALLBACK
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
            return _get_fallback(experience, question_volume, role)

    except requests.exceptions.RequestException as exc:
        logging.warning(f"LLM question generation failed ({exc}); using fallback bank.")
        return _get_fallback(experience, question_volume, role)


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
