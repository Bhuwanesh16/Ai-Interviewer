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
You are InterviewAI, an industrial-grade AI assessment engine. 
You are a Lead Software Architect at a top-tier tech firm.
You are conducting a high-signal technical interview. 
Generate questions that are:
1. Deeply technical and scenario-based.
2. Focused on trade-offs, scalability, and internal workings.
3. Tailored to the candidate's specific "Core Competencies" (Tech Stack).
4. No generic boilerplate questions.
5. No explanations, no feedback, no pleasantries.
"""

# Role-Specific Technical Guidance for High-Signal Assessment
ROLE_SPECIFIC_THEMES = {
    "Software Engineer": "Memory management, concurrency patterns, distributed system design, and performance profiling.",
    "Frontend Developer": "Browser rendering pipeline, state synchronization, advanced React hooks internal, and bundle optimization.",
    "Backend Developer": "Database isolation levels, distributed locking, service discovery, and zero-downtime deployment strategies.",
    "Full Stack Developer": "Client-server state synchronization, authentication flows, monorepo architecture, and end-to-end performance.",
    "Data Scientist": "Model entropy, hyperparameter optimization, mathematical proofs for algorithms, and large-scale data ingestion.",
    "Machine Learning Engineer": "Model quantization, inference latency at edge, feature store architecture, and MLOps pipelines.",
    "DevOps Engineer": "Chaos engineering, multi-cloud networking, eBPF monitoring, and GitOps parity.",
    "Product Manager": "Go-to-market strategy for technical APIs, feature prioritization under technical debt, and analytics-driven pivots.",
    "UI/UX Designer": "Atomic design systems, perceptual performance, accessibility (WCAG 2.1), and design-to-code automation.",
    "QA Engineer": "Shift-left security testing, property-based testing, performance regression suites, and CI pipeline stability.",
    "Cyber Security Analyst": "Zero-trust architecture, advanced persistent threats (APT), cryptographic implementations, and forensic analysis."
}

DYNAMIC_PROMPT_TEMPLATE = """
[INTERVIEW CONFIGURATION]
- ROLE: {role}
- SENIORITY: {experience}
- TECH STACK: {skills}
- DOMAIN THEMES: {role_themes}
- TARGET VOLUME: {question_volume}

[INSTRUCTIONS]
Generate {question_volume} high-signal interview questions for a {experience} {role}.
Integrate these specific technologies: {skills}.
Focus on: {role_themes}.

Difficulty Alignment:
- Entry: Implementation details, basic patterns, debugging.
- Intermediate: Optimization, system interaction, trade-offs.
- Senior: High-level architecture, scalability, cross-team strategy, failure modes.
- Lead: Team growth, technical vision, conflict resolution, roadmap alignment.

Output Format:
Q1: [Question text]
Q2: [Question text]
...
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
Evaluate the following interview response like a senior engineering lead from a top-tier tech company. 
Provide a sophisticated, encouraging, but technically rigorous assessment.

Context:
- Role: {role}
- Experience Level: {experience}
- Question Asked: {question}
- Candidate's Transcribed Answer: "{transcript}"
- Dimensional Scores (0-1 scale): Facial/Presence={facial_score}, Speech/Clarity={speech_score}, Content/Relevance={nlp_score}

Your Evaluation Goal:
Produce a structured report that helps the candidate understand their specific gaps and strengths.

Evaluation Rules:
1. STRENGTHS: Start with 1-2 sentences highlighting what the candidate did well (e.g., specific keywords used, good structure, confident delivery).
2. EVALUATOR NOTES: Provide 2-3 sentences of deep technical feedback. Focus on the substance—what were they missing? Was the logic sound? Use professional, industry-standard terminology.
3. TECHNICAL IMPROVEMENTS: Provide 3 distinct, actionable, and DEEPLY technical improvements. Avoid generic advice like "be more confident." Instead, suggest specific frameworks, patterns, or methodologies (e.g., "Use the STAR method," "Mention Big-O complexity," "Reference ACID properties").

Output Format:
Strengths: <Concise bullet points of what they did well>
Feedback: <Your narrative evaluation>
Improvements:
- <Deeply technical improvement 1>
- <Deeply technical improvement 2>
- <Deeply technical improvement 3>
"""

# ---------------------------------------------------------------------------
# Role/level-aware fallback question banks (used when Ollama is unreachable)
# Roles match the Interview Configuration dropdown: Software Engineer, Frontend, Backend, etc.
# ---------------------------------------------------------------------------

def _level_bank(entry: list, intermediate: list, senior: list, lead: list) -> dict:
    return {"entry level": entry, "intermediate": intermediate, "senior": senior, "lead / manager": lead}

ROLE_FALLBACK_BANKS = {
    "Software Engineer": _level_bank(
        ["How do you ensure your code follows 'Clean Code' principles and remains maintainable?", "Walk me through your process for debugging a memory leak or unexpected crash.", "Explain the difference between a process and a thread in a way that relates to an app you've built.", "How do you choose between using an Array vs a Linked List for a specific problem?"],
        ["Describe a critical production bug you diagnosed and resolved using a Root Cause Analysis (RCA) process.", "How do you balance technical debt reduction with the pressure to deliver new features?", "Explain your approach to Designing a Scalable API. What principles drive your decisions?", "Describe a time you had to optimize a slow algorithm. What was the Big-O before and after?"],
        ["How do you architect systems to be resilient to partial failures in a distributed environment?", "What trade-offs do you evaluate when choosing between microservices and a well-structured monolith?", "Describe your approach to designing a system that must handle 10x current traffic without a complete rewrite.", "Explain how you handle data consistency vs availability in a distributed database system."],
        ["How do you manage a high-performing senior engineer who is consistently missing commitments?", "Describe how you align a multi-year technical roadmap with the immediate needs of the business.", "Walk me through how you'd run a high-stakes post-mortem after a massive system outage.", "How do you foster a culture of technical excellence and mentorship within your engineering org?"],
    ),
    "Frontend Developer": _level_bank(
        ["Describe a component you built recently. How did you handle its internal state and props?", "How do you ensure your UI is accessible (A11y) and performs well on low-end devices?", "Explain how you'd optimize a page that has a high Largest Contentful Paint (LCP) score.", "Walk me through a time you fixed a complex responsiveness issue that only appeared on certain browsers."],
        ["How do you manage complex application state in a large-scale SPA? What patterns do you prefer?", "Describe your approach to building a reusable UI component library that multiple teams can use.", "How do you handle error boundaries and global error states in a modern frontend framework?", "Explain your strategy for code-splitting and bundle size optimization in a production app."],
        ["How would you design a frontend architecture for a multi-team monorepo using Micro-Frontends?", "What trade-offs do you consider when choosing between Server-Side Rendering (SSR) and Client-Side Rendering (CSR)?", "How do you ensure consistent UX/UI standards are maintained across dozens of different products?", "Describe your approach to implementing a robust end-to-end (E2E) testing strategy for a complex user flow."],
        ["How do you mentor junior frontend developers on modern best practices like testing and modularity?", "How do you bridge the gap between design vision and technical feasibility during early project stages?", "Describe how you'd lead a migration from a legacy framework to a modern one without stopping feature work.", "How do you set the technical standard for CSS architecture and performance across the company?"],
    ),
    "Backend Developer": _level_bank(
        ["Walk me through a RESTful API you designed. How did you handle versioning and error codes?", "Describe a time you optimized a slow SQL query. What tools or techniques (like EXPLAIN) did you use?", "How do you handle logging and monitoring in your services to catch issues before users do?", "Explain the difference between authentication and authorization in a backend context."],
        ["How do you design APIs that can handle high concurrency and low latency requirements?", "Describe your approach to database schema migrations. How do you ensure zero-downtime deployments?", "How do you ensure backward compatibility when making breaking changes to an internal service?", "Explain your strategy for implementing a robust caching layer using Redis or Memcached."],
        ["How do you design systems to be resilient to cascades of failures in a microservices architecture?", "What trade-offs do you evaluate when choosing between SQL (acid-compliant) and NoSQL (eventually consistent) stores?", "Describe your approach to implementing an event-driven or message-based architecture using RabbitMQ or Kafka.", "How do you handle security vulnerabilities like SQL Injection or SSRF at the application layer?"],
        ["How do you set technical standards and architectural patterns for backend services across multiple teams?", "Walk me through how you'd lead the technical recovery of a system that is down during a peak traffic event.", "How do you balance the cost of infrastructure with the need for high availability and performance?", "Describe your approach to mentoring senior architects and fostering a culture of ownership."],
    ),
    "Full Stack Developer": _level_bank(
        ["Describe a full-stack feature you shipped end-to-end. What was your process?", "How do you handle consistency between frontend and backend contracts?"],
        ["Describe a time you had to optimize both client and server performance for a slow feature.", "How do you choose which business logic lives on the client vs the server?"],
        ["How would you design a scalable full-stack architecture for a real-time collaborative application?", "What trade-offs do you consider when building isomorphic or server-side rendered apps?"],
        ["How do you mentor full-stack developers to maintain high quality across both the frontend and backend?", "Describe how you lead a major architectural transition across the entire web stack."],
    ),
    "Data Scientist": _level_bank(
        ["Walk me through a data analysis project you completed. What were your key findings?", "How do you validate that your statistical model or analysis is correct?"],
        ["How do you choose between different modeling approaches for a specific business problem?", "Describe a time you communicated complex data results to non-technical stakeholders."],
        ["How would you design an ML pipeline for production scalability?", "What trade-offs do you evaluate when selecting features vs model complexity?"],
        ["How do you align the data science roadmap with the long-term business KPIs?", "How do you mentor data scientists on best practices and scientific reproducibility?"],
    ),
    "Machine Learning Engineer": _level_bank(
        ["Describe an ML model you trained and deployed. What was your end-to-end workflow?", "How do you debug a model that is significantly underperforming in production?"],
        ["How do you optimize model inference latency for real-time web use cases?", "Describe your approach to A/B testing model changes in a production environment."],
        ["How would you design an ML platform that supports multiple internal teams and models?", "What trade-offs do you consider when choosing between batch and real-time inference?"],
        ["How do you set ML engineering standards across your organization?", "How do you balance speed of experimentation with the stability of production models?"],
    ),
    "DevOps Engineer": _level_bank(
        ["Describe a CI/CD pipeline you built or improved. What were the key bottlenecks?", "How do you troubleshoot a service that is intermittently failing in a production cluster?"],
        ["How do you design infrastructure for high availability and automated disaster recovery?", "Describe your approach to monitoring and proactive alerting. What metrics matter most?"],
        ["How would you design a multi-region deployment strategy for a global application?", "What trade-offs do you consider when choosing between Kubernetes and serverless orchestration?"],
        ["How do you lead the cultural shift towards SRE and post-mortem accountability?", "How do you align DevOps practices with the daily workflows of your development teams?"],
    ),
    "Product Manager": _level_bank(
        ["Describe a product decision you made based on user feedback. What was the measured outcome?", "How do you prioritize features when you have highly limited engineering resources?"],
        ["How do you balance aggressive stakeholder requests with a long-term product strategy?", "Describe a time you had to deprioritize a major feature. How did you communicate it?"],
        ["How do you drive cohesive product strategy in an extremely competitive or shifting market?", "What trade-offs do you make when balancing innovation with clearing technical debt?"],
        ["How do you mentor junior product managers and foster a mature product culture?", "How do you resolve fundamental conflicts between product vision and engineering constraints?"],
    ),
    "UI/UX Designer": _level_bank(
        ["Walk me through a design project from initial research to the final hand-off.", "How do you incorporate conflicting user feedback into your design iterations?"],
        ["How do you balance user needs with business goals and technical engineering constraints?", "Describe your approach to building and maintaining a scalable design system."],
        ["How would you lead the design for an entirely new product from the ground up?", "What trade-offs do you consider when choosing between UI consistency and UX innovation?"],
        ["How do you mentor other designers and foster design maturity within the organization?", "How do you align a long-term design vision with the reality of engineering sprints?"],
    ),
    "QA Engineer": _level_bank(
        ["Describe your testing strategy for a recent complex feature. What did you cover?", "How do you decide when to invest in automation vs sticking to manual testing?"],
        ["How do you design test cases for complex legacy systems that lack documentation?", "Describe your approach to regression testing and defining 'Ready for Release' criteria."],
        ["How would you design a holistic QA strategy for an entire new platform or product?", "What trade-offs do you consider when choosing between different test automation frameworks?"],
        ["How do you lead quality-first initiatives across multiple engineering teams?", "How do you align QA metrics with the actual product and business goals?"],
    ),
    "Cyber Security Analyst": _level_bank(
        ["Describe a security assessment or audit you performed. What were your top findings?", "How do you stay updated on rapidly emerging threats and zero-day vulnerabilities?"],
        ["How do you prioritize remediation when hundreds of vulnerabilities are found simultaneously?", "Describe your approach to penetration testing or red team simulation exercises."],
        ["How would you design a comprehensive security program for a rapidly growing startup?", "What trade-offs do you consider when balancing extreme security with user usability?"],
        ["How do you build a security-first culture across both engineering and operations?", "How do you align critical security initiatives with the overall business priorities?"],
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
    """
    if isinstance(raw, list):
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

    if not questions:
        questions = [l.strip() for l in lines if len(l.strip()) > 20]

    return questions[:n] if questions else [f"Tell me about your experience as a {role}."]


def _get_fallback(experience: str, n: int, role: str = "Software Engineer") -> list:
    """Return n questions from the role- and level-appropriate bank."""
    level_key = experience.lower().strip()
    role_banks = ROLE_FALLBACK_BANKS.get(role, ROLE_FALLBACK_BANKS.get("Software Engineer"))
    bank = role_banks.get(level_key, FALLBACK_BANKS.get(level_key, GENERIC_FALLBACK))
    
    shuffled = bank.copy()
    random.shuffle(shuffled)
    while len(shuffled) < n:
        shuffled += bank
    return shuffled[:n]


def generate_questions(role: str, experience: str, skills: str, question_volume: int) -> list:
    """
    Generate interview questions via the local Ollama service.
    """
    question_volume = max(1, int(question_volume))
    role_themes = ROLE_SPECIFIC_THEMES.get(role, "General engineering trade-offs and best practices.")

    prompt = MASTER_PROMPT + "\n" + DYNAMIC_PROMPT_TEMPLATE.format(
        role=role,
        experience=experience,
        skills=skills if skills else "General area-appropriate skills",
        role_themes=role_themes,
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
                    "temperature": 0.5,
                    "top_p": 0.9,
                    "top_k": 40,
                    "num_predict": 768,
                    "stop": ["[END]", "Candidate:"]
                },
            },
            timeout=60,
        )
        response.raise_for_status()
        raw = response.json().get("response", "")
        questions = _parse_questions(raw, question_volume, role)
        if questions:
            logging.info(f"LLM generated {len(questions)} questions for {role} ({experience})")
            return questions
        else:
            return _get_fallback(experience, question_volume, role)

    except Exception as exc:
        logging.warning(f"LLM question generation failed ({exc}); using fallback bank.")
        return _get_fallback(experience, question_volume, role)


def generate_followup(role: str, experience: str, previous_question: str, candidate_answer: str) -> str:
    """
    Ask the LLM for a context-aware follow-up question.
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
        cleaned = re.sub(r'^Follow-up[:.]\s*', '', raw.strip(), flags=re.IGNORECASE)
        return cleaned if cleaned else f"Can you elaborate more on: '{previous_question}'?"
    except Exception:
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
        
        strengths_match = re.search(r'Strengths:\s*(.*?)(?=Feedback:|$)', raw, re.DOTALL | re.IGNORECASE)
        feedback_match = re.search(r'Feedback:\s*(.*?)(?=Improvements:|$)', raw, re.DOTALL | re.IGNORECASE)
        improvements_match = re.search(r'Improvements:\s*(.*)', raw, re.DOTALL | re.IGNORECASE)
        
        strengths = strengths_match.group(1).strip() if strengths_match else ""
        feedback_core = feedback_match.group(1).strip() if feedback_match else ""
        
        if strengths:
            feedback = f"Strengths: {strengths}\n\nEvaluator Notes: {feedback_core}"
        else:
            feedback = feedback_core
            
        improvements_raw = improvements_match.group(1).strip() if improvements_match else ""
        suggestions = [re.sub(r'^[-*•\s\d.]+', '', line).strip() for line in improvements_raw.splitlines() if line.strip()]
        
        return {
            "feedback": feedback,
            "suggestions": suggestions[:3]
        }
    except Exception:
        return None
