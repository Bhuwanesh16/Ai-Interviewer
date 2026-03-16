"""
question_service.py — Interview question generation via local Ollama (phi3).

Performance fixes applied:
- num_predict reduced 1024 → 512  (cuts generation time ~50%)
- top_k reduced 40 → 20           (faster token sampling)
- top_p reduced 0.9 → 0.8         (tighter sampling = faster)
- num_thread set to 8              (use all CPU cores explicitly)
- Prompt template shortened        (less input = faster processing)
"""

import re
import os
import random
import logging
import time
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL    = os.environ.get("OLLAMA_MODEL", "phi3")
OLLAMA_TIMEOUT  = int(os.environ.get("OLLAMA_TIMEOUT", "120"))

# Hard cap for question generation. If phi3 takes longer than this, we fall back
# to the predefined question banks to keep the UI responsive.
# Reduced to 15s for snappier UX.
QUESTION_GEN_TIMEOUT_SECONDS = int(os.environ.get("QUESTION_GEN_TIMEOUT", "15"))

# Simple always-available fallback bank (used on phi3 errors/timeouts).
FALLBACK_QUESTIONS = [
    "Tell me about yourself.",
    "What are your strengths and weaknesses?",
    "Describe a challenging project you worked on.",
    "Why do you want this role?",
    "Explain a difficult technical concept you recently learned.",
]

OLLAMA_GENERATE_URL = f"{OLLAMA_BASE_URL}/api/generate"
OLLAMA_TAGS_URL     = f"{OLLAMA_BASE_URL}/api/tags"

# ── Availability cache ────────────────────────────────────────────────────────
_ollama_available:     Optional[bool] = None
_ollama_checked_at:    float = 0.0
_OLLAMA_CACHE_SECONDS: int   = 60


def _check_ollama_available() -> bool:
    """
    Ping Ollama's /api/tags endpoint and verify the configured model is pulled.
    Result cached for 60s to avoid repeated pings.
    """
    global _ollama_available, _ollama_checked_at

    now = time.monotonic()
    if _ollama_available is not None and (now - _ollama_checked_at) < _OLLAMA_CACHE_SECONDS:
        return _ollama_available

    try:
        resp = requests.get(OLLAMA_TAGS_URL, timeout=5)
        resp.raise_for_status()
        data   = resp.json()
        pulled = [m.get("name", "") for m in data.get("models", [])]

        model_ready = any(
            name == OLLAMA_MODEL or name.startswith(f"{OLLAMA_MODEL}:")
            for name in pulled
        )

        if model_ready:
            logger.info(f"Ollama running; '{OLLAMA_MODEL}' ready. Available: {pulled}")
            _ollama_available = True
        else:
            logger.warning(
                f"Ollama running but '{OLLAMA_MODEL}' not found. "
                f"Available: {pulled}. Run: ollama pull {OLLAMA_MODEL}"
            )
            _ollama_available = False

    except requests.exceptions.ConnectionError:
        logger.warning(f"Cannot reach Ollama at {OLLAMA_BASE_URL}. Is it running?")
        _ollama_available = False
    except Exception as exc:
        logger.warning(f"Ollama availability check failed: {exc}")
        _ollama_available = False

    _ollama_checked_at = now
    return _ollama_available


# ── Prompts ───────────────────────────────────────────────────────────────────

MASTER_PROMPT = (
    "You are an expert technical interviewer. "
    "You ask precise, scenario-based questions tailored to the candidate's role and level. "
    "You never add explanations, preamble, or extra text — only the questions."
)

ROLE_SPECIFIC_THEMES = {
    "Software Engineer":         "Memory management, concurrency, distributed system design, performance profiling.",
    "Frontend Developer":        "Browser rendering, state synchronisation, React internals, bundle optimisation.",
    "Backend Developer":         "Database isolation levels, distributed locking, service discovery, zero-downtime deployments.",
    "Full Stack Developer":      "Client-server state sync, authentication flows, monorepo architecture, E2E performance.",
    "Data Scientist":            "Model entropy, hyperparameter optimisation, algorithm proofs, large-scale data ingestion.",
    "Machine Learning Engineer": "Model quantisation, inference latency at edge, feature store architecture, MLOps pipelines.",
    "DevOps Engineer":           "Chaos engineering, multi-cloud networking, eBPF monitoring, GitOps.",
    "Product Manager":           "Go-to-market strategy, feature prioritisation under technical debt, analytics-driven pivots.",
    "UI/UX Designer":            "Atomic design systems, perceptual performance, WCAG 2.1 accessibility, design-to-code automation.",
    "QA Engineer":               "Shift-left testing, property-based testing, performance regression, CI stability.",
    "Cyber Security Analyst":    "Zero-trust architecture, APT analysis, cryptographic implementation, forensic analysis.",
}

# SHORT prompt = phi3 processes faster and hallucinates less
QUESTION_PROMPT_TEMPLATE = """{master}

Role: {role} | Level: {experience} | Stack: {skills}

Generate exactly {n} interview questions. Rules:
- Each question must end with ?
- Entry=basics, Intermediate=trade-offs, Senior=architecture, Lead=vision
- No preamble, no explanations, no blank lines

Output:
Q1: <question?>
Q2: <question?>
"""

FOLLOWUP_PROMPT_TEMPLATE = """{master}

Role: {role} ({experience})
Previous question: {previous_question}
Candidate answer: {candidate_answer}

Write ONE follow-up question.
Follow-up: <question?>
"""

FEEDBACK_PROMPT_TEMPLATE = """{master}

Role: {role} ({experience})
Question: {question}
Answer: "{transcript}"
Scores — Presence: {facial_score:.2f}, Speech: {speech_score:.2f}, Content: {nlp_score:.2f}

Strengths: <1-2 sentences>
Feedback: <2-3 sentences>
Improvements:
- <improvement 1>
- <improvement 2>
- <improvement 3>
"""


# ── Parsing ───────────────────────────────────────────────────────────────────

def _parse_questions(raw: str, n: int, role: str = "Engineer") -> list:
    """Parse LLM output into a clean list of question strings."""
    if isinstance(raw, list):
        return [q.strip() for q in raw if isinstance(q, str) and len(q.strip()) > 10][:n]

    questions = []
    for line in str(raw).strip().splitlines():
        line = line.strip()
        if not line:
            continue
        match = re.match(
            r'^(?:Q\s*\d+\s*[:.]\s*|\d+\s*[.)]\s*|[-•*]\s*|Follow-up\s*[:.]\s*)(.+)',
            line, re.IGNORECASE
        )
        if match:
            q = match.group(1).strip()
            if len(q) > 10:
                questions.append(q)
        elif len(line) > 30 and not line.lower().startswith(
            ("here are", "sure", "below", "note", "output", "format", "rules",
             "generate", "role:", "level:", "tech ", "themes:", "stack:")
        ):
            questions.append(line)

    cleaned = []
    for q in questions:
        if not q.endswith("?"):
            q = q.rstrip(".!") + "?"
        cleaned.append(q)

    seen, unique = set(), []
    for q in cleaned:
        key = q[:60].lower()
        if key not in seen:
            seen.add(key)
            unique.append(q)

    return unique[:n] if unique else [f"Tell me about your experience as a {role}?"]


# ── Fallback question banks ───────────────────────────────────────────────────

def _level_bank(entry, intermediate, senior, lead):
    return {
        "entry level":    entry,
        "intermediate":   intermediate,
        "senior":         senior,
        "lead / manager": lead,
    }


ROLE_FALLBACK_BANKS = {
    "Software Engineer": _level_bank(
        [
            "How do you ensure your code follows Clean Code principles and remains maintainable?",
            "Walk me through debugging a memory leak you encountered in a real project.",
            "Explain the difference between a process and a thread with a concrete example.",
            "How do you choose between an Array and a Linked List for a given problem?",
            "Describe a time you had to refactor legacy code. What was your strategy?",
        ],
        [
            "Describe a critical production bug you diagnosed. Walk me through your Root Cause Analysis.",
            "How do you balance technical debt reduction with the pressure to ship new features?",
            "Explain your approach to designing a scalable REST API. What principles guide you?",
            "Describe a time you optimised a slow algorithm. What was the Big-O before and after?",
            "How do you design for fault tolerance in a system with third-party dependencies?",
        ],
        [
            "How do you architect systems resilient to partial failures in distributed environments?",
            "What trade-offs do you evaluate when choosing between microservices and a monolith?",
            "Describe how you'd design a system to handle 10x current traffic without a full rewrite.",
            "How do you handle data consistency vs availability in a distributed database?",
            "Walk me through your approach to designing an event-sourced system.",
        ],
        [
            "How do you manage a high-performing engineer who is consistently missing commitments?",
            "Describe how you align a multi-year technical roadmap with immediate business needs.",
            "Walk me through how you'd lead a post-mortem after a major production outage.",
            "How do you foster a culture of technical excellence and mentorship in your org?",
        ],
    ),
    "Frontend Developer": _level_bank(
        [
            "Describe a component you built recently. How did you handle state and props?",
            "How do you ensure your UI is accessible and performs well on low-end devices?",
            "Explain how you'd optimise a page with a poor Largest Contentful Paint score.",
            "Walk me through fixing a responsiveness issue that only appeared in certain browsers.",
        ],
        [
            "How do you manage complex application state in a large-scale SPA?",
            "Describe your approach to building a reusable component library for multiple teams.",
            "How do you handle error boundaries and global error states in your framework?",
            "Explain your strategy for code-splitting and bundle size optimisation in production.",
        ],
        [
            "How would you design a frontend architecture for a multi-team monorepo using Micro-Frontends?",
            "What trade-offs do you consider between SSR and CSR for a given product?",
            "How do you ensure consistent UX/UI standards across dozens of different products?",
            "Describe your approach to implementing E2E testing for a complex user flow.",
        ],
        [
            "How do you mentor junior frontend developers on modern best practices?",
            "Describe how you'd lead a migration from a legacy framework without stopping feature work.",
            "How do you bridge the gap between design vision and technical feasibility?",
        ],
    ),
    "Backend Developer": _level_bank(
        [
            "Walk me through a RESTful API you designed. How did you handle versioning and error codes?",
            "Describe a time you optimised a slow SQL query. What tools did you use?",
            "How do you handle logging and monitoring to catch issues before users do?",
            "Explain the difference between authentication and authorisation in a backend context.",
        ],
        [
            "How do you design APIs for high concurrency and low latency?",
            "Describe your approach to database schema migrations for zero-downtime deployments.",
            "How do you ensure backward compatibility when making breaking changes to a service?",
            "Explain your strategy for implementing a robust caching layer with Redis.",
        ],
        [
            "How do you design systems resilient to cascading failures in microservices?",
            "What trade-offs do you evaluate between ACID-compliant SQL and eventually consistent NoSQL?",
            "Describe your approach to event-driven architecture using Kafka or RabbitMQ.",
            "How do you handle security vulnerabilities like SQL Injection at the application layer?",
        ],
        [
            "How do you set technical standards for backend services across multiple teams?",
            "Walk me through leading the technical recovery of a downed system during peak traffic.",
            "How do you balance infrastructure cost with high availability requirements?",
        ],
    ),
    "Full Stack Developer": _level_bank(
        [
            "Describe a full-stack feature you shipped end-to-end. What was your process?",
            "How do you maintain consistency between frontend and backend API contracts?",
        ],
        [
            "Describe a time you optimised both client and server performance for a slow feature.",
            "How do you decide which business logic lives on the client vs the server?",
        ],
        [
            "How would you design a scalable full-stack architecture for a real-time collaborative app?",
            "What trade-offs do you consider when building isomorphic or SSR applications?",
        ],
        [
            "How do you mentor full-stack developers to maintain quality across both layers?",
            "Describe how you'd lead a major architectural transition across the entire web stack.",
        ],
    ),
    "Data Scientist": _level_bank(
        [
            "Walk me through a data analysis project. What were your key findings and how did you validate them?",
            "How do you validate that your statistical model or analysis is correct?",
        ],
        [
            "How do you choose between different modelling approaches for a specific business problem?",
            "Describe a time you communicated complex data results to non-technical stakeholders.",
        ],
        [
            "How would you design an ML pipeline for production scalability?",
            "What trade-offs do you evaluate when selecting features vs model complexity?",
        ],
        [
            "How do you align the data science roadmap with long-term business KPIs?",
            "How do you mentor data scientists on reproducibility and best practices?",
        ],
    ),
    "Machine Learning Engineer": _level_bank(
        [
            "Describe an ML model you trained and deployed. What was your end-to-end workflow?",
            "How do you debug a model that is significantly underperforming in production?",
        ],
        [
            "How do you optimise model inference latency for real-time web use cases?",
            "Describe your approach to A/B testing model changes in production.",
        ],
        [
            "How would you design an ML platform supporting multiple internal teams and models?",
            "What trade-offs do you consider between batch and real-time inference?",
        ],
        [
            "How do you set ML engineering standards across your organisation?",
            "How do you balance speed of experimentation with production model stability?",
        ],
    ),
    "DevOps Engineer": _level_bank(
        [
            "Describe a CI/CD pipeline you built or improved. What were the key bottlenecks?",
            "How do you troubleshoot a service intermittently failing in a production cluster?",
        ],
        [
            "How do you design infrastructure for high availability and automated disaster recovery?",
            "Describe your monitoring and alerting strategy. What metrics matter most?",
        ],
        [
            "How would you design a multi-region deployment strategy for a global application?",
            "What trade-offs do you consider between Kubernetes and serverless orchestration?",
        ],
        [
            "How do you lead the cultural shift towards SRE and post-mortem accountability?",
            "How do you align DevOps practices with the daily workflows of development teams?",
        ],
    ),
    "Product Manager": _level_bank(
        [
            "Describe a product decision you made based on user feedback. What was the measured outcome?",
            "How do you prioritise features with limited engineering resources?",
        ],
        [
            "How do you balance aggressive stakeholder requests with long-term product strategy?",
            "Describe a time you had to deprioritise a major feature. How did you communicate it?",
        ],
        [
            "How do you drive cohesive product strategy in a competitive or rapidly shifting market?",
            "What trade-offs do you make when balancing innovation with technical debt?",
        ],
        [
            "How do you mentor junior PMs and foster a mature product culture?",
            "How do you resolve fundamental conflicts between product vision and engineering constraints?",
        ],
    ),
    "UI/UX Designer": _level_bank(
        [
            "Walk me through a design project from initial research to final hand-off.",
            "How do you incorporate conflicting user feedback into your design iterations?",
        ],
        [
            "How do you balance user needs with business goals and technical constraints?",
            "Describe your approach to building and maintaining a scalable design system.",
        ],
        [
            "How would you lead the design for an entirely new product from the ground up?",
            "What trade-offs do you consider between UI consistency and UX innovation?",
        ],
        [
            "How do you mentor designers and foster design maturity within the organisation?",
            "How do you align a long-term design vision with the reality of engineering sprints?",
        ],
    ),
    "QA Engineer": _level_bank(
        [
            "Describe your testing strategy for a recent complex feature. What did you cover?",
            "How do you decide when to invest in automation vs sticking to manual testing?",
        ],
        [
            "How do you design test cases for complex legacy systems that lack documentation?",
            "Describe your approach to regression testing and defining 'Ready for Release' criteria.",
        ],
        [
            "How would you design a holistic QA strategy for an entirely new platform?",
            "What trade-offs do you consider when choosing between test automation frameworks?",
        ],
        [
            "How do you lead quality-first initiatives across multiple engineering teams?",
            "How do you align QA metrics with actual product and business goals?",
        ],
    ),
    "Cyber Security Analyst": _level_bank(
        [
            "Describe a security assessment you performed. What were your top findings?",
            "How do you stay current on rapidly emerging threats and zero-day vulnerabilities?",
        ],
        [
            "How do you prioritise remediation when hundreds of vulnerabilities are found simultaneously?",
            "Describe your approach to penetration testing or red team exercises.",
        ],
        [
            "How would you design a comprehensive security programme for a rapidly growing startup?",
            "What trade-offs do you consider when balancing security with user usability?",
        ],
        [
            "How do you build a security-first culture across engineering and operations?",
            "How do you align critical security initiatives with overall business priorities?",
        ],
    ),
}

GENERIC_FALLBACK = [
    "Tell me about your most challenging technical project and your specific contributions.",
    "How do you approach learning new technologies in your domain?",
    "Describe a situation where you had to make a technical trade-off. What drove your decision?",
    "Walk me through a time you had to deliver under tight deadline pressure.",
    "How do you handle disagreements about technical direction within a team?",
]


def _get_fallback(experience: str, n: int, role: str = "Software Engineer") -> list:
    level_key = experience.lower().strip()
    # Special-case custom roles to use generic questions directly.
    if role.lower().startswith("other"):
        role_bank = None
    else:
        role_bank = ROLE_FALLBACK_BANKS.get(role)

    if not role_bank:
        for key in ROLE_FALLBACK_BANKS:
            if key.lower() in role.lower() or role.lower() in key.lower():
                role_bank = ROLE_FALLBACK_BANKS[key]
                break

    if not role_bank:
        # Default to generic bank for unknown/custom roles.
        bank = GENERIC_FALLBACK
    else:
        bank = role_bank.get(level_key, GENERIC_FALLBACK)
    shuffled = bank.copy()
    random.shuffle(shuffled)
    while len(shuffled) < n:
        shuffled += bank.copy()
    return shuffled[:n]


# ── Public API ────────────────────────────────────────────────────────────────

def generate_questions(role: str, experience: str, skills: str, question_volume: int) -> list:
    """
    Generate `question_volume` interview questions for the given role/level/skills.
    Tries phi3 via Ollama first; falls back to static bank if unavailable/slow.
    """
    question_volume = max(1, min(int(question_volume), 20))

    if not _check_ollama_available():
        logger.info(f"Ollama unavailable — using fallback bank for {role} ({experience})")
        return _get_fallback(experience, question_volume, role)

    themes     = ROLE_SPECIFIC_THEMES.get(role, "General engineering trade-offs and best practices.")
    skills_str = skills.strip() if skills else "general domain skills"

    prompt = QUESTION_PROMPT_TEMPLATE.format(
        master=MASTER_PROMPT,
        role=role,
        experience=experience,
        skills=skills_str,
        themes=themes,
        n=question_volume,
    )

    try:
        timeout_s = min(max(1, QUESTION_GEN_TIMEOUT_SECONDS), max(1, OLLAMA_TIMEOUT))
        response = requests.post(
            OLLAMA_GENERATE_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.5,
                    "top_p":       0.8,   # was 0.9  — tighter = faster
                    "top_k":       20,    # was 40   — fewer candidates = faster
                    "num_predict": 512,   # was 1024 — half tokens = ~half time
                    "num_thread":  8,     # use all CPU cores
                    "stop": ["[END]", "---", "Output:", "Rules:", "Note:", "<|end|>"],
                },
            },
            timeout=timeout_s,
        )
        response.raise_for_status()
        raw       = response.json().get("response", "")
        questions = _parse_questions(raw, question_volume, role)

        valid = [q for q in questions if len(q) > 15 and "?" in q]

        if valid:
            logger.info(f"phi3 generated {len(valid)} questions for {role} ({experience})")
            return valid

        logger.warning(f"phi3 returned no valid questions (raw[:200]: {raw[:200]!r}) — fallback")
        return _get_fallback(experience, question_volume, role)

    except requests.exceptions.Timeout:
        logger.warning(f"phi3 timed out after {min(max(1, QUESTION_GEN_TIMEOUT_SECONDS), max(1, OLLAMA_TIMEOUT))}s — using fallback")
        global _ollama_available
        _ollama_available = None
        # Use the simple fallback bank first, then pad with role-specific bank if needed.
        out = [random.choice(FALLBACK_QUESTIONS) for _ in range(question_volume)]
        if len(out) < question_volume:
            out += _get_fallback(experience, question_volume - len(out), role)
        return out[:question_volume] if out else [random.choice(FALLBACK_QUESTIONS)]

    except Exception as exc:
        logger.warning(f"Question generation failed ({exc}) — using fallback")
        out = [random.choice(FALLBACK_QUESTIONS) for _ in range(question_volume)]
        if len(out) < question_volume:
            out += _get_fallback(experience, question_volume - len(out), role)
        return out[:question_volume] if out else [random.choice(FALLBACK_QUESTIONS)]


def generate_questions_with_source(
    *,
    role: str,
    experience: str,
    skills: str,
    question_volume: int,
    force_fallback: bool = False,
) -> tuple[list, str]:
    """
    Generate questions and return (questions, source).
    source is "llm" when phi3 succeeds within timeout, otherwise "fallback".
    """
    question_volume = max(1, min(int(question_volume), 20))

    if force_fallback:
        return _get_fallback(experience, question_volume, role), "fallback"

    if not _check_ollama_available():
        logger.info(f"Ollama unavailable — using fallback bank for {role} ({experience})")
        qs = _get_fallback(experience, question_volume, role)
        random.shuffle(qs)
        return qs, "fallback"

    questions = generate_questions(
        role=role,
        experience=experience,
        skills=skills,
        question_volume=question_volume,
    )

    # For a more natural interview feel, randomise the order of the
    # questions within the generated set while keeping them role/level
    # appropriate.
    if isinstance(questions, list) and len(questions) > 1:
        random.shuffle(questions)

    # If generate_questions had to fall back due to timeout/error it resets availability cache
    # to re-check on the next call. Treat that path as fallback for UI labeling.
    if _ollama_available is None or _ollama_available is False:
        return questions, "fallback"
    return questions, "llm"


def generate_followup(role: str, experience: str, previous_question: str, candidate_answer: str) -> str:
    """Generate a context-aware follow-up question for a live interview."""
    followup_fallbacks = [
        "Can you walk me through your reasoning step-by-step?",
        "What trade-offs did you consider, and why did you choose that approach?",
        "How would you validate this in production (tests/metrics/logging)?",
        "What would you change if you had to scale this 10x?",
        "What edge cases or failure modes does your approach have?",
    ]
    if not _check_ollama_available():
        return random.choice(followup_fallbacks)

    prompt = FOLLOWUP_PROMPT_TEMPLATE.format(
        master=MASTER_PROMPT,
        role=role,
        experience=experience,
        previous_question=previous_question,
        candidate_answer=candidate_answer,
    )
    try:
        response = requests.post(
            OLLAMA_GENERATE_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.65,
                    "num_predict": 150,
                    "num_thread":  8,
                    "stop": ["<|end|>", "---"],
                },
            },
            # Fast follow-up: keep the interview flowing.
            timeout=min(15, max(1, QUESTION_GEN_TIMEOUT_SECONDS)),
        )
        response.raise_for_status()
        raw     = response.json().get("response", "").strip()
        cleaned = re.sub(r'^Follow-up\s*[:.]\s*', '', raw, flags=re.IGNORECASE).strip()
        if not cleaned.endswith("?"):
            cleaned = cleaned.rstrip(".!") + "?"
        return cleaned or f"Can you elaborate further on '{previous_question[:60]}'?"
    except Exception:
        return random.choice(followup_fallbacks)


def generate_ai_feedback(role: str, experience: str, question: str,
                         transcript: str, scores: dict) -> Optional[dict]:
    """
    Generate AI feedback for a completed answer.
    Returns { "feedback": str, "suggestions": list[str] } or None if unavailable.
    """
    if not _check_ollama_available():
        return None

    prompt = FEEDBACK_PROMPT_TEMPLATE.format(
        master=MASTER_PROMPT,
        role=role,
        experience=experience,
        question=question,
        transcript=transcript,
        facial_score=scores.get("facial", 0),
        speech_score=scores.get("speech", 0),
        nlp_score=scores.get("nlp", 0),
    )
    try:
        response = requests.post(
            OLLAMA_GENERATE_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.45,
                    "num_predict": 400,
                    "num_thread":  8,
                    "stop": ["<|end|>", "---"],
                },
            },
            timeout=45,
        )
        response.raise_for_status()
        raw = response.json().get("response", "")

        strengths_m    = re.search(r'Strengths:\s*(.*?)(?=Feedback:|Improvements:|$)',    raw, re.DOTALL | re.IGNORECASE)
        feedback_m     = re.search(r'Feedback:\s*(.*?)(?=Improvements:|$)',               raw, re.DOTALL | re.IGNORECASE)
        improvements_m = re.search(r'Improvements:\s*(.*)',                               raw, re.DOTALL | re.IGNORECASE)

        strengths     = strengths_m.group(1).strip()    if strengths_m    else ""
        feedback_core = feedback_m.group(1).strip()     if feedback_m     else raw.strip()
        improvements  = improvements_m.group(1).strip() if improvements_m else ""

        feedback    = f"Strengths: {strengths}\n\nEvaluator Notes: {feedback_core}" if strengths else feedback_core
        suggestions = [
            re.sub(r'^[-*•\s\d.]+', '', line).strip()
            for line in improvements.splitlines()
            if line.strip() and len(line.strip()) > 10
        ][:3]

        return {"feedback": feedback, "suggestions": suggestions}

    except Exception as exc:
        logger.warning(f"AI feedback generation failed: {exc}")
        return None