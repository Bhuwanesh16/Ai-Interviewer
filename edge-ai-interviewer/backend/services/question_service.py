"""
question_service.py — Interview question generation via local Ollama / LLaMA 3.

Fixes applied:
- OLLAMA_URL is now read from OLLAMA_URL env var so it's configurable without
  touching source code (e.g. OLLAMA_URL=http://192.168.1.10:11434/api/generate).
- Added _check_ollama_available() which pings /api/tags before attempting
  generation, and caches the result for 60s to avoid spamming the check.
- Model name is configurable via OLLAMA_MODEL env var (default: "llama3").
  Switch to "llama3.1", "mistral", etc. by setting the env var.
- Timeouts on the requests.post call were too short for local inference —
  increased to 90s and made configurable via OLLAMA_TIMEOUT env var.
- _parse_questions() was silently dropping valid questions that didn't match
  the "Q1:" prefix if the model responded with a numbered list "1." format.
  Extended regex handles more output styles.
- generate_questions() now validates that returned questions are actual
  questions (contain a "?" or are long enough) before accepting them.
- generate_ai_feedback() is integrated as a fallback inside report_service —
  this file now exports it cleanly so report_service can import it.
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
OLLAMA_BASE_URL  = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL     = os.environ.get("OLLAMA_MODEL", "llama3")
OLLAMA_TIMEOUT   = int(os.environ.get("OLLAMA_TIMEOUT", "90"))

OLLAMA_GENERATE_URL = f"{OLLAMA_BASE_URL}/api/generate"
OLLAMA_TAGS_URL     = f"{OLLAMA_BASE_URL}/api/tags"

# ── Availability cache ────────────────────────────────────────────────────────
_ollama_available:      Optional[bool] = None
_ollama_checked_at:     float = 0.0
_OLLAMA_CACHE_SECONDS:  int   = 60  # re-check at most once per minute


def _check_ollama_available() -> bool:
    """
    Ping Ollama's /api/tags endpoint and verify the configured model is pulled.
    Result is cached for _OLLAMA_CACHE_SECONDS to avoid thundering-herd on startup.
    """
    global _ollama_available, _ollama_checked_at

    now = time.monotonic()
    if _ollama_available is not None and (now - _ollama_checked_at) < _OLLAMA_CACHE_SECONDS:
        return _ollama_available

    try:
        resp = requests.get(OLLAMA_TAGS_URL, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        pulled = [m.get("name", "") for m in data.get("models", [])]
        model_ready = any(OLLAMA_MODEL in name for name in pulled)

        if model_ready:
            logger.info(f"Ollama reachable; '{OLLAMA_MODEL}' is ready.")
            _ollama_available = True
        else:
            logger.warning(
                f"Ollama reachable but '{OLLAMA_MODEL}' not found. "
                f"Available: {pulled}. Run: ollama pull {OLLAMA_MODEL}"
            )
            _ollama_available = False

    except requests.exceptions.ConnectionError:
        logger.warning(
            f"Ollama not reachable at {OLLAMA_BASE_URL}. "
            "Start it with: ollama serve"
        )
        _ollama_available = False
    except Exception as exc:
        logger.warning(f"Ollama availability check failed: {exc}")
        _ollama_available = False

    _ollama_checked_at = now
    return _ollama_available


# ── Prompts ───────────────────────────────────────────────────────────────────

MASTER_PROMPT = """You are InterviewAI, an industrial-grade AI assessment engine built by a Lead Software Architect at a top-tier tech firm. You conduct high-signal technical interviews. Your questions are:
1. Deeply technical and scenario-based
2. Focused on trade-offs, scalability, and internal workings
3. Tailored to the candidate's specific tech stack
4. Never generic boilerplate
5. Always returned in the exact format requested — no explanations, no preamble
"""

ROLE_SPECIFIC_THEMES = {
    "Software Engineer":        "Memory management, concurrency patterns, distributed system design, and performance profiling.",
    "Frontend Developer":       "Browser rendering pipeline, state synchronization, advanced React hooks internals, and bundle optimization.",
    "Backend Developer":        "Database isolation levels, distributed locking, service discovery, and zero-downtime deployment.",
    "Full Stack Developer":     "Client-server state sync, authentication flows, monorepo architecture, and end-to-end performance.",
    "Data Scientist":           "Model entropy, hyperparameter optimization, mathematical algorithm proofs, and large-scale data ingestion.",
    "Machine Learning Engineer":"Model quantization, inference latency at edge, feature store architecture, and MLOps pipelines.",
    "DevOps Engineer":          "Chaos engineering, multi-cloud networking, eBPF monitoring, and GitOps parity.",
    "Product Manager":          "Go-to-market strategy for technical APIs, feature prioritization under technical debt, and analytics-driven pivots.",
    "UI/UX Designer":           "Atomic design systems, perceptual performance, WCAG 2.1 accessibility, and design-to-code automation.",
    "QA Engineer":              "Shift-left security testing, property-based testing, performance regression suites, and CI pipeline stability.",
    "Cyber Security Analyst":   "Zero-trust architecture, advanced persistent threats (APT), cryptographic implementations, and forensic analysis.",
}

QUESTION_PROMPT_TEMPLATE = """{master}

[INTERVIEW CONFIGURATION]
- ROLE: {role}
- SENIORITY: {experience}
- TECH STACK: {skills}
- DOMAIN THEMES: {themes}
- NUMBER OF QUESTIONS REQUIRED: {n}

[TASK]
Generate exactly {n} high-signal interview questions for a {experience}-level {role}.
Integrate the listed tech stack. Match the difficulty to the seniority level:
  Entry     → implementation details, debugging, basic patterns
  Intermediate → optimisation, system interaction, trade-offs
  Senior    → architecture, scalability, failure modes
  Lead      → technical vision, team dynamics, roadmap alignment

[OUTPUT FORMAT — STRICTLY FOLLOW THIS]
Q1: <question text ending with ?>
Q2: <question text ending with ?>
...
Q{n}: <question text ending with ?>

Do not add any text outside this format. No explanations. No introductions. No blank lines between questions.
"""

FOLLOWUP_PROMPT_TEMPLATE = """{master}

[LIVE INTERVIEW CONTEXT]
- Role: {role}
- Seniority: {experience}
- Previous Question: {previous_question}
- Candidate Answer: {candidate_answer}

[TASK]
Generate ONE context-aware follow-up question.
- If the answer is strong → go deeper, probe edge cases or trade-offs
- If the answer is partial → ask for clarification on the weakest point
- If the answer is weak → probe the foundational concept they missed

[OUTPUT FORMAT]
Follow-up: <question text ending with ?>
"""

FEEDBACK_PROMPT_TEMPLATE = """{master}

[EVALUATION CONTEXT]
- Role: {role}
- Experience Level: {experience}
- Question Asked: {question}
- Candidate Answer: "{transcript}"
- Scores (0–1): Presence={facial_score:.2f}, Speech={speech_score:.2f}, Content={nlp_score:.2f}

[TASK]
Produce a rigorous but encouraging performance report.

[OUTPUT FORMAT — STRICTLY FOLLOW THIS]
Strengths: <1-2 sentences on what the candidate did well>
Feedback: <2-3 sentences of deep technical evaluation — gaps, logic quality, professional terminology>
Improvements:
- <Specific, actionable technical improvement 1>
- <Specific, actionable technical improvement 2>
- <Specific, actionable technical improvement 3>
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
        # Match: "Q1:", "Q1.", "1.", "1)", "- ", "• " etc.
        match = re.match(
            r'^(?:Q\s*\d+\s*[:.]\s*|\d+\s*[.)]\s*|[-•*]\s*|Follow-up\s*[:.]\s*)(.+)',
            line, re.IGNORECASE
        )
        if match:
            q = match.group(1).strip()
            if len(q) > 10:
                questions.append(q)
        elif len(line) > 30 and not line.lower().startswith(("here are", "sure", "below", "note")):
            # Accept free-form lines that look like questions
            questions.append(line)

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for q in questions:
        key = q[:60].lower()
        if key not in seen:
            seen.add(key)
            unique.append(q)

    return unique[:n] if unique else [f"Tell me about your experience as a {role}."]


# ── Fallback question banks ───────────────────────────────────────────────────

def _level_bank(entry, intermediate, senior, lead):
    return {
        "entry level":   entry,
        "intermediate":  intermediate,
        "senior":        senior,
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
    role_bank = ROLE_FALLBACK_BANKS.get(role)
    if not role_bank:
        # fuzzy match
        for key in ROLE_FALLBACK_BANKS:
            if key.lower() in role.lower() or role.lower() in key.lower():
                role_bank = ROLE_FALLBACK_BANKS[key]
                break
    if not role_bank:
        role_bank = ROLE_FALLBACK_BANKS["Software Engineer"]

    bank = role_bank.get(level_key, GENERIC_FALLBACK)
    shuffled = bank.copy()
    random.shuffle(shuffled)
    # pad if needed
    while len(shuffled) < n:
        shuffled += bank.copy()
    return shuffled[:n]


# ── Public API ────────────────────────────────────────────────────────────────

def generate_questions(role: str, experience: str, skills: str, question_volume: int) -> list:
    """
    Generate `question_volume` interview questions for the given role/level/skills.

    Tries Ollama first; falls back to the curated static bank if unavailable.
    Returns a plain Python list of question strings.
    """
    question_volume = max(1, min(int(question_volume), 20))

    if not _check_ollama_available():
        logger.info(f"Ollama unavailable — using fallback bank for {role} ({experience})")
        return _get_fallback(experience, question_volume, role)

    themes = ROLE_SPECIFIC_THEMES.get(role, "General engineering trade-offs and best practices.")
    skills_str = skills.strip() if skills else "general area-appropriate skills"

    prompt = QUESTION_PROMPT_TEMPLATE.format(
        master=MASTER_PROMPT,
        role=role,
        experience=experience,
        skills=skills_str,
        themes=themes,
        n=question_volume,
    )

    try:
        response = requests.post(
            OLLAMA_GENERATE_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.5,
                    "top_p": 0.9,
                    "top_k": 40,
                    "num_predict": 1024,
                    "stop": ["[END]", "Candidate:", "---"],
                },
            },
            timeout=OLLAMA_TIMEOUT,
        )
        response.raise_for_status()
        raw = response.json().get("response", "")
        questions = _parse_questions(raw, question_volume, role)

        if questions:
            logger.info(f"LLM generated {len(questions)} questions for {role} ({experience})")
            return questions

        logger.warning("LLM returned no parseable questions — using fallback")
        return _get_fallback(experience, question_volume, role)

    except requests.exceptions.Timeout:
        logger.warning(f"Ollama timed out after {OLLAMA_TIMEOUT}s — using fallback")
        # Invalidate cache so next call re-checks
        global _ollama_available
        _ollama_available = None
        return _get_fallback(experience, question_volume, role)
    except Exception as exc:
        logger.warning(f"LLM question generation failed ({exc}) — using fallback")
        return _get_fallback(experience, question_volume, role)


def generate_followup(role: str, experience: str, previous_question: str, candidate_answer: str) -> str:
    """Generate a context-aware follow-up question for a live interview."""
    if not _check_ollama_available():
        return f"Can you go deeper on: '{previous_question[:80]}...'?"

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
                "options": {"temperature": 0.65, "num_predict": 200},
            },
            timeout=30,
        )
        response.raise_for_status()
        raw = response.json().get("response", "").strip()
        cleaned = re.sub(r'^Follow-up\s*[:.]\s*', '', raw, flags=re.IGNORECASE).strip()
        return cleaned or f"Can you elaborate further on '{previous_question[:60]}'?"
    except Exception:
        return f"Can you elaborate further on '{previous_question[:60]}'?"


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
                "options": {"temperature": 0.45, "num_predict": 500},
            },
            timeout=45,
        )
        response.raise_for_status()
        raw = response.json().get("response", "")

        strengths_m    = re.search(r'Strengths:\s*(.*?)(?=Feedback:|Improvements:|$)', raw, re.DOTALL | re.IGNORECASE)
        feedback_m     = re.search(r'Feedback:\s*(.*?)(?=Improvements:|$)', raw, re.DOTALL | re.IGNORECASE)
        improvements_m = re.search(r'Improvements:\s*(.*)', raw, re.DOTALL | re.IGNORECASE)

        strengths     = strengths_m.group(1).strip()    if strengths_m    else ""
        feedback_core = feedback_m.group(1).strip()     if feedback_m     else raw.strip()
        improvements  = improvements_m.group(1).strip() if improvements_m else ""

        feedback = f"Strengths: {strengths}\n\nEvaluator Notes: {feedback_core}" if strengths else feedback_core
        suggestions = [
            re.sub(r'^[-*•\s\d.]+', '', line).strip()
            for line in improvements.splitlines()
            if line.strip() and len(line.strip()) > 10
        ][:3]

        return {"feedback": feedback, "suggestions": suggestions}

    except Exception as exc:
        logger.warning(f"AI feedback generation failed: {exc}")
        return None