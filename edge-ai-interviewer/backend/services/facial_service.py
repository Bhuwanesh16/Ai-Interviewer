"""
Facial analysis service.

Uses MediaPipe Face Mesh to extract basic facial cues like presence,
smile (mouth aspect ratio), eye contact, head stability, and brow
engagement from the video to determine interview performance.

Fixes applied:
- Added landmark count guard before accessing iris indices 468/473
- Widened expression_score normalization range for better discrimination
- Multi-face detection: max_num_faces raised to 4; frames with >1 face
  are flagged as integrity violations and a score penalty is applied.
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

# Fraction of frames with multiple faces before a penalty is applied
_MULTI_FACE_THRESHOLD = 0.10   # 10 % of processed frames
# Score deduction applied when threshold is exceeded (0–1 scale)
_MULTI_FACE_PENALTY   = 0.20


class FacialAnalysisService:
    def __init__(self):
        self._loaded = MP_AVAILABLE
        if MP_AVAILABLE:
            try:
                self.face_mesh = mp_face_mesh.FaceMesh(
                    static_image_mode=False,
                    max_num_faces=4,          # Detect up to 4 faces for integrity checking
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
        multi_face_frames = 0     # frames where >1 face detected (integrity check)
        max_faces_seen = 0        # peak number of faces in a single frame
        smile_scores = []
        eye_contact_scores = []
        head_stability_scores = []
        brow_scores = []           # brow-raise engagement

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
                num_faces = len(results.multi_face_landmarks)

                # ── Multi-face integrity detection ────────────────────────────
                if num_faces > 1:
                    multi_face_frames += 1
                    logging.warning(
                        f"[FacialService] {num_faces} faces detected in frame "
                        f"{frame_count} — possible integrity violation."
                    )
                if num_faces > max_faces_seen:
                    max_faces_seen = num_faces

                # Analyse the PRIMARY (largest / most prominent) face only
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
                head_stability = 1.0 - min(offset * 4.0, 1.0)   # was *5 — less punishing
                head_stability_scores.append(head_stability)

                # 4. Brow raise — engagement signal
                # Upper brow: 10 (right brow upper), 285 (left brow upper)
                # Lower reference: cheek midpoint y
                try:
                    r_brow = landmarks[10]
                    l_brow = landmarks[285]
                    avg_brow_y = (r_brow.y + l_brow.y) / 2
                    # Lower brow_y value (in normalized coords) = brows higher on face = raised
                    # Typical relaxed position ~0.28; raised ~0.22; furrowed ~0.33
                    brow_raise = max(0.0, min((0.30 - avg_brow_y) / 0.10, 1.0))
                    brow_scores.append(brow_raise)
                except (IndexError, AttributeError):
                    pass

        cap.release()

        if total_frames == 0:
            return {"facial_score": 0.5, "metrics": {"presence": "Empty Video"}}

        presence_ratio = face_detected_frames / total_frames
        if presence_ratio < 0.2:
            # Linear decay from 0.2 down instead of hard cliff at 0.2
            presence_score = 0.1 + presence_ratio * 0.5
        else:
            presence_score = 0.5 + presence_ratio * 0.5   # 0.2 → 0.6, 1.0 → 1.0

        avg_smile          = np.mean(smile_scores)          if smile_scores          else 0
        avg_eye_contact    = np.mean(eye_contact_scores)    if eye_contact_scores    else 0.5
        avg_head_stability = np.mean(head_stability_scores) if head_stability_scores else 0.5
        avg_brow           = np.mean(brow_scores)           if brow_scores           else 0.4

        # ── Multi-face integrity assessment ──────────────────────────────────
        multi_face_ratio = multi_face_frames / total_frames if total_frames > 0 else 0.0
        multiple_faces_detected = multi_face_ratio >= _MULTI_FACE_THRESHOLD

        if multiple_faces_detected:
            logging.warning(
                f"[FacialService] Integrity violation: multiple faces in "
                f"{round(multi_face_ratio * 100)}% of frames "
                f"(peak: {max_faces_seen} faces). Applying score penalty."
            )

        # Professional Scoring Logic (recalibrated v3 + multi-face penalty):
        # 1. Presence   (15%): Being on screen consistently.
        # 2. Expression (25%): Smile + brow raise = broader engagement.
        # 3. Eye Contact (35%): Most direct signal of attentiveness.
        # 4. Head Stability (25%): Facing forward, not fidgeting.

        # Expression = blend of smile ratio and brow engagement
        # Smile normalization: ratio 0.30 → score 0.5, 0.55 → 1.0 (kept from v2)
        smile_score  = min((max(avg_smile - 0.30, 0) / 0.25) * 0.5 + 0.5, 1.0)
        # Blend smile and brow raise (60/40)
        expression_score = smile_score * 0.60 + avg_brow * 0.40

        final_score = (
            (presence_score     * 0.15) +
            (expression_score   * 0.25) +
            (avg_eye_contact    * 0.35) +
            (avg_head_stability * 0.25)
        )

        # Apply integrity penalty for multiple faces
        if multiple_faces_detected:
            # Scale penalty by how severe the violation is (up to 2× the base penalty)
            severity = min(multi_face_ratio / _MULTI_FACE_THRESHOLD, 2.0)
            final_score -= _MULTI_FACE_PENALTY * severity

        final_score = max(0.05, min(final_score, 1.0))

        return {
            "facial_score": round(float(final_score), 2),
            "metrics": {
                "presence": f"{round(presence_ratio * 100)}%",
                "eye_contact": "High" if avg_eye_contact > 0.8 else "Good" if avg_eye_contact > 0.6 else "Needs Improvement",
                "engagement":  "Enthusiastic" if expression_score > 0.75 else "Professional" if expression_score > 0.45 else "Reserved",
                "posture":     "Stable" if avg_head_stability > 0.8 else "Restless" if avg_head_stability < 0.5 else "Average",
                "smile_index":       round(float(avg_smile), 2),
                "eye_contact_index": round(float(avg_eye_contact), 2),
                # ── Multi-face integrity fields ──────────────────────────────
                "multiple_faces_detected":     multiple_faces_detected,
                "multiple_face_violation_pct": round(multi_face_ratio * 100, 1),
                "face_count_max":              max_faces_seen,
            }
        }


facial_service = FacialAnalysisService()