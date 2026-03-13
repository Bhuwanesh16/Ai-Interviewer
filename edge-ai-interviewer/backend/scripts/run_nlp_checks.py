"""
Run quick NLP/ASR checks from the command line.

Usage:
  python run_nlp_checks.py

This script imports the live services and prints sample results so you can
verify Whisper/ffmpeg availability and how the NLP scoring behaves for
several transcript variants (good answer, short text, sentinel, unrelated).
"""

from services.nlp_service import nlp_service
from services.transcription_service import transcription_service, EMPTY_TRANSCRIPT_SENTINEL

SAMPLES = [
    ("Tell me about a time you solved a challenging technical problem.",
     "I debugged a race condition in our distributed cache by adding locks and retries."),

    ("Explain how you design scalable APIs.",
     "I use RESTful routes, pagination, and rate limiting. We shard the DB."),

    ("Any short answer", "OK."),
    ("Any empty audio", EMPTY_TRANSCRIPT_SENTINEL),
    ("Unrelated question", "I like pizza and movies."),
]


def main():
    print("ASR status:")
    print(transcription_service.status())
    print("\nNLP scoring samples:\n")

    for q, a in SAMPLES:
        print("Question:", q)
        print("Answer:", a)
        r = nlp_service.score_relevance(q, a, skills="python,react")
        print("Result:", r)
        print("-" * 60)


if __name__ == '__main__':
    main()
