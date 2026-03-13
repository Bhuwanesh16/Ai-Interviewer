from services.transcription_service import transcription_service
import json

try:
    print("ASR Status (Initial):")
    print(json.dumps(transcription_service.status(), indent=2))
except Exception as e:
    print(f"Error getting status: {e}")
