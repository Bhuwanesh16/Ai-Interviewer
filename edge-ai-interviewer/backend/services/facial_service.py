"""
Facial analysis service.

Uses MediaPipe Face Mesh to extract basic facial cues like presence
and smile (mouth aspect ratio) from the video to determine engagement.

Fixes applied:
- Added landmark count guard before accessing iris indices 468/473
- Widened expression_score normalization range for better discrimination
"""

from pathlib import Path
from typing import Dict
import logging

try:
    import cv2
    import math
    import mediapipe as mp
    try:
        from mediapipe.python.solutions import face_mesh as mp_face_mesh
    except ImportError:
        import mediapipe.solutions.face_mesh as mp_face_mesh
    import numpy as np
    MP_AVAILABLE = True
except ImportError as e:
    MP_AVAILABLE = False
    logging.warning(f"Facial analysis dependencies missing ({e}). Service will fallback.")


class FacialAnalysisService:
    def __init__(self):
        self._loaded = MP_AVAILABLE
        if MP_AVAILABLE:
            try:
                self.face_mesh = mp_face_mesh.FaceMesh(
                    static_image_mode=False,
                    max_num_faces=1,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5
                )
            except Exception as e:
                logging.error(f"Failed to initialize FaceMesh: {e}")
                self._loaded = False

    def analyze_video(self, video_path: str) -> Dict[str, any]:
        """
        Analyze facial expressions, eye contact, and head stability from the given video.
        Returns a detailed professional score and metric breakdown.
        """
        p = Path(video_path)
        if not p.exists() or not self._loaded:
            return {"facial_score": 0.5, "metrics": {"presence": "No Camera"}}

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {"facial_score": 0.5, "metrics": {"presence": "Video Error"}}

        total_frames = 0
        face_detected_frames = 0
        smile_scores = []
        eye_contact_scores = []
        head_stability_scores = []

        # Sample frames to process faster:
        # - aim for ~1 frame per second (if fps is known)
        # - hard-cap the total number of processed frames
        fps = cap.get(cv2.CAP_PROP_FPS) or 0
        frame_skip = int(max(1, round(fps))) if fps > 0 else 5
        max_processed_frames = 30
        frame_count = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame_count += 1
            if frame_count % frame_skip != 0:
                continue

            total_frames += 1
            if total_frames >= max_processed_frames:
                break
            h, w, _ = frame.shape

            # Convert the BGR image to RGB before processing
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            try:
                results = self.face_mesh.process(frame_rgb)
            except Exception as e:
                logging.warning(f"MediaPipe processing error: {e}")
                continue

            if results.multi_face_landmarks:
                face_detected_frames += 1
                landmarks = results.multi_face_landmarks[0].landmark

                # 1. Smile / Engagement (Mouth width vs Face width)
                # Mouth left: 61, right: 291
                left = landmarks[61]
                right = landmarks[291]
                mouth_width = math.hypot(right.x - left.x, right.y - left.y)

                # Face left: 234, right: 454
                cheek_left = landmarks[234]
                cheek_right = landmarks[454]
                face_width = math.hypot(cheek_right.x - cheek_left.x, cheek_right.y - cheek_left.y)

                if face_width > 0:
                    smile_ratio = mouth_width / face_width
                    smile_scores.append(smile_ratio)

                # 2. Eye Contact (Iris position relative to eye corners)
                # Iris landmarks 468/473 require refine_landmarks=True AND the full
                # 478-point model. Guard with a length check before accessing them.
                # FIX: was previously unguarded — raised IndexError if refined model
                #      was unavailable, silently dropped all eye contact data.
                if len(landmarks) > 473:
                    try:
                        # Left Eye corners: 362 (inner), 263 (outer)
                        # Right Eye corners: 33 (outer), 133 (inner)
                        # Irises: 468 (left), 473 (right)
                        l_inner, l_outer = landmarks[362], landmarks[263]
                        r_outer, r_inner = landmarks[33], landmarks[133]
                        l_iris, r_iris = landmarks[468], landmarks[473]

                        def eye_ratio(inner, outer, iris):
                            total = math.hypot(outer.x - inner.x, outer.y - inner.y)
                            dist = math.hypot(iris.x - inner.x, iris.y - inner.y)
                            return dist / total if total > 0 else 0.5

                        l_ratio = eye_ratio(l_inner, l_outer, l_iris)
                        r_ratio = eye_ratio(r_inner, r_outer, r_iris)

                        # Target ratio ~0.5 means iris is centered
                        eye_contact = 1.0 - (abs(l_ratio - 0.5) + abs(r_ratio - 0.5))
                        eye_contact_scores.append(max(0, eye_contact))
                    except (IndexError, AttributeError) as e:
                        logging.debug(f"Eye contact calculation skipped: {e}")

                # 3. Head Stability (Nose position relative to face boundaries)
                # Nose tip: 4
                nose = landmarks[4]
                face_center_x = (cheek_left.x + cheek_right.x) / 2
                offset = abs(nose.x - face_center_x)
                head_stability = 1.0 - min(offset * 5, 1.0)
                head_stability_scores.append(head_stability)

        cap.release()

        if total_frames == 0:
            return {"facial_score": 0.5, "metrics": {"presence": "Empty Video"}}

        presence_ratio = face_detected_frames / total_frames
        if presence_ratio < 0.2:
            return {"facial_score": 0.2, "metrics": {"presence": "Low / Off-screen"}}

        avg_smile = np.mean(smile_scores) if smile_scores else 0
        avg_eye_contact = np.mean(eye_contact_scores) if eye_contact_scores else 0.5
        avg_head_stability = np.mean(head_stability_scores) if head_stability_scores else 0.5

        # Professional Scoring Logic:
        # 1. Presence (20%): Just being on screen.
        # 2. Engagement (30%): Smile/Expression ratio.
        # 3. Eye Contact (30%): Looking at the camera.
        # 4. Body Language (20%): Head stability / Facing forward.

        # FIX: Widened normalization range from (0.35–0.50) to (0.30–0.55).
        # Old range compressed most real candidates into a narrow 0.5–0.73 band.
        # New range: smile_ratio 0.30 → score 0.5, 0.55 → score 1.0
        expression_score = min((max(avg_smile - 0.30, 0) / 0.25) * 0.5 + 0.5, 1.0)

        final_score = (
            (presence_ratio * 0.2) +
            (expression_score * 0.3) +
            (avg_eye_contact * 0.3) +
            (avg_head_stability * 0.2)
        )
        final_score = max(0.1, min(final_score, 1.0))

        return {
            "facial_score": round(float(final_score), 2),
            "metrics": {
                "presence": f"{round(presence_ratio * 100)}%",
                "eye_contact": "High" if avg_eye_contact > 0.8 else "Good" if avg_eye_contact > 0.6 else "Needs Improvement",
                "engagement": "Enthusiastic" if expression_score > 0.75 else "Professional" if expression_score > 0.45 else "Reserved",
                "posture": "Stable" if avg_head_stability > 0.8 else "Restless" if avg_head_stability < 0.5 else "Average",
                "smile_index": round(float(avg_smile), 2),
                "eye_contact_index": round(float(avg_eye_contact), 2)
            }
        }


facial_service = FacialAnalysisService()