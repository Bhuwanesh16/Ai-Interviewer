/**
 * WebcamRecorder.jsx — Performance-optimized v2
 *
 * Fixes for '[Violation] message handler took Xms':
 *
 * 1. SEND_THROTTLE_MS raised 100 → 333ms (~3fps inference instead of 10fps)
 *    MediaPipe inference is ~150-200ms/frame on CPU. At 10fps you queue
 *    frames faster than they process, causing a backlog that spikes to 1400ms.
 *    3fps means one frame fully completes before the next starts.
 *
 * 2. onResults is now fully non-blocking:
 *    - No setState inside onResults at all
 *    - Scores written to a ref (latestScoreRef)
 *    - A separate setInterval flushes to React state at 2Hz (every 500ms)
 *    This completely decouples MediaPipe inference from React render cycles.
 *
 * 3. faceMesh.send() wrapped in try/catch — if MediaPipe is still processing
 *    the previous frame it throws; we now silently skip instead of queuing.
 *
 * 4. Camera resolution reduced 640x480 → 320x240
 *    MediaPipe face detection works fine at 320x240. Lower res = 4x fewer
 *    pixels to process = significantly faster inference per frame.
 *
 * 5. refineLandmarks kept false — saves +40ms/frame for unused precision.
 *
 * 6. Canvas paint loop unchanged (rAF-based, separate from inference).
 *
 * 7. isSendingRef guard — prevents concurrent faceMesh.send() calls entirely.
 */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js'
const CAMERA_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'

// 1fps inference — very low throughput to avoid main-thread backlog
// Use when running on low-end machines or during heavy CPU load.
const SEND_THROTTLE_MS = 1000
// Flush scores to React state once per second — minimizes React renders
// and reduces 'message' handler overhead from the MediaPipe wasm worker.
const STATE_FLUSH_MS = 1000

const MESH_POINTS = [33, 133, 362, 263, 61, 291, 4, 234, 454]

function computeScores(lm) {
  let eyeScore = 0.5
  if (lm.length > 473) {
    const eyeRatio = (inner, outer, iris) => {
      const total = Math.hypot(outer.x - inner.x, outer.y - inner.y)
      const dist = Math.hypot(iris.x - inner.x, iris.y - inner.y)
      return total > 0 ? dist / total : 0.5
    }
    const lR = eyeRatio(lm[362], lm[263], lm[468])
    const rR = eyeRatio(lm[33], lm[133], lm[473])
    eyeScore = Math.max(0, 1 - (Math.abs(lR - 0.5) + Math.abs(rR - 0.5)))
  }

  const mouthW = Math.hypot(lm[291].x - lm[61].x, lm[291].y - lm[61].y)
  const faceW = Math.hypot(lm[454].x - lm[234].x, lm[454].y - lm[234].y)
  const smileRatio = faceW > 0 ? mouthW / faceW : 0
  const smileScore = Math.min(Math.max((smileRatio - 0.3) / 0.25, 0) * 0.5 + 0.5, 1)

  const centerX = (lm[234].x + lm[454].x) / 2
  const headStability = Math.max(0, 1 - Math.abs(lm[4].x - centerX) * 5)

  const score = Math.min(
    Math.max(0.1, (headStability * 0.35) + (eyeScore * 0.35) + (smileScore * 0.30)),
    1
  )

  return {
    score,
    eyeContact: eyeScore > 0.75 ? 'High' : eyeScore > 0.5 ? 'Good' : 'Low',
    posture: headStability > 0.75 ? 'Stable' : headStability > 0.45 ? 'Average' : 'Restless',
    smile: Math.round(smileRatio * 100),
    presence: '100%',
  }
}

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src; s.crossOrigin = 'anonymous'
    s.onload = resolve; s.onerror = reject
    document.head.appendChild(s)
  })

const WebcamRecorder = ({
  isRecording,
  mediaStream,
  setMediaStream,
  onModelStatus,
  onEmotionScore,
  onIntegrityViolation,
}) => {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const cameraRef = useRef(null)
  const streamRef = useRef(null)
  const ctxRef = useRef(null)
  const isRecRef = useRef(isRecording)
  const lastSendRef = useRef(0)
  const canvasSizeRef = useRef({ w: 0, h: 0 })
  const pendingLmRef = useRef(null)
  const rafRef = useRef(null)
  const flushRef = useRef(null)          // setInterval for state flush
  const isSendingRef = useRef(false)         // guard against concurrent sends
  const latestScoreRef = useRef(null)          // latest score, flushed by interval
  const onEmotionRef = useRef(onEmotionScore) // stable ref to avoid re-init

  const [modelReady, setModelReady] = useState(false)
  const [camError, setCamError] = useState(null)

  // Keep refs in sync without triggering re-init
  useEffect(() => { isRecRef.current = isRecording }, [isRecording])
  useEffect(() => { onEmotionRef.current = onEmotionScore }, [onEmotionScore])

  useEffect(() => {
    let cancelled = false

    // ── rAF canvas paint loop — completely separate from MediaPipe ────────────
    const paintLoop = () => {
      rafRef.current = requestAnimationFrame(paintLoop)
      const lm = pendingLmRef.current
      const canvas = canvasRef.current
      if (!lm || !canvas || !isRecRef.current) return
      if (!ctxRef.current) ctxRef.current = canvas.getContext('2d')
      const ctx = ctxRef.current
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(14,165,233,0.6)'
      for (let i = 0; i < MESH_POINTS.length; i++) {
        const pt = lm[MESH_POINTS[i]]
        if (!pt) continue
        ctx.beginPath()
        ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 2, 0, 6.2832)
        ctx.fill()
      }
    }

    // ── State flush interval — decouples MediaPipe from React renders ─────────
    // onResults writes to latestScoreRef (sync, zero overhead).
    // This interval reads it and calls setState at a controlled 2Hz rate.
    // Result: React never re-renders inside the MediaPipe message handler.
    const startFlushInterval = () => {
      let lastEmitted = null
      flushRef.current = setInterval(() => {
        // If the page is hidden, don't flush — reduces background work
        if (typeof document !== 'undefined' && document.hidden) return

        const score = latestScoreRef.current
        if (!score) return

        // Avoid emitting identical or near-identical scores to prevent
        // unnecessary React renders. Threshold tuned to 1% change.
        const prev = lastEmitted
        const diff = prev == null ? Infinity : Math.abs((score.score || 0) - (prev.score || 0))
        if (diff < 0.01) return

        lastEmitted = score
        onEmotionRef.current?.(score)
        latestScoreRef.current = null
      }, STATE_FLUSH_MS)
    }

    const init = async () => {
      try {
        await loadScript(MEDIAPIPE_CDN)
        await loadScript(CAMERA_CDN)
        if (cancelled) return

        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

        streamRef.current = stream
        setMediaStream(stream)

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream

        // eslint-disable-next-line no-undef
        const faceMesh = new FaceMesh({
          locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
        })
        faceMesh.setOptions({
          // Detect up to 2 faces for integrity checks.
          maxNumFaces: 2,
          refineLandmarks: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })

        let multipleFacesCounter = 0
        faceMesh.onResults((results) => {
          // ── ZERO React state calls here — everything goes into refs ──────────
          const canvas = canvasRef.current
          if (!canvas) return

          const vw = video.videoWidth || 320
          const vh = video.videoHeight || 240
          if (canvasSizeRef.current.w !== vw || canvasSizeRef.current.h !== vh) {
            canvas.width = vw
            canvas.height = vh
            ctxRef.current = null
            canvasSizeRef.current = { v: vw, h: vh }
          }

          const faceCount = results.multiFaceLandmarks?.length || 0

          // Integrity: Only trigger if multiple faces are detected for 5 consecutive frames
          // to prevent false positives from background movement or shadows.
          if (faceCount > 1) {
            multipleFacesCounter++
            if (multipleFacesCounter >= 5) {
              try { onIntegrityViolation?.({ type: 'MULTIPLE_FACES', faceCount }) } catch { /* ignore */ }
            }
          } else {
            multipleFacesCounter = 0
          }

          if (!faceCount) {
            pendingLmRef.current = null
            // Write fallback score to ref — flushed by interval, not here
            latestScoreRef.current = {
              score: 0.3, eyeContact: 'Low', posture: 'Unknown', smile: 0, presence: '0%',
            }
            return
          }

          const lm = results.multiFaceLandmarks[0]
          pendingLmRef.current = lm               // rAF painter reads this
          latestScoreRef.current = computeScores(lm) // interval flushes this
          // ── No setState, no onEmotionScore call — completely non-blocking ──
        })

        // eslint-disable-next-line no-undef
        const camera = new Camera(video, {
          onFrame: async () => {
            const now = performance.now()
            // If the tab is hidden, skip processing to reduce background CPU.
            if (typeof document !== 'undefined' && document.hidden) return
            // FIX 1: time-based throttle — skip frames within window
            if (now - lastSendRef.current < SEND_THROTTLE_MS) return
            // FIX: concurrency guard — if previous send is still running, skip
            if (isSendingRef.current) return
            lastSendRef.current = now
            isSendingRef.current = true
            try {
              await faceMesh.send({ image: video })
            } catch {
              // MediaPipe busy — silently skip this frame
            } finally {
              isSendingRef.current = false
            }
          },
          width: 320, height: 240,   // FIX: was 640x480 — 4x fewer pixels
        })

        await camera.start()
        cameraRef.current = camera

        paintLoop()
        startFlushInterval()

        if (!cancelled) {
          setModelReady(true)
          onModelStatus?.(true)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('WebcamRecorder init error:', err)
          setCamError(
            err.name === 'NotAllowedError'
              ? 'Camera permission denied. Please allow camera access and reload.'
              : 'Could not start camera. Check your device and browser permissions.'
          )
          onModelStatus?.(false)
        }
      }
    }

    init()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (flushRef.current) clearInterval(flushRef.current)
      cameraRef.current?.stop?.()
      streamRef.current?.getTracks().forEach(t => t.stop())
      setMediaStream(null)
    }
  }, []) // ← empty deps: init once, use refs for all changing values

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        borderRadius: '1.25rem',
        border: `1px solid ${isRecording ? 'rgba(225,29,72,0.25)' : 'rgba(148,163,184,0.2)'}`,
        background: '#0f172a',
        overflow: 'hidden',
        position: 'relative',
        aspectRatio: '4/3',
        boxShadow: isRecording
          ? '0 4px 24px rgba(225,29,72,0.2)'
          : '0 1px 3px rgba(0,0,0,0.12)',
        transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
      }}
    >
      <video
        ref={videoRef}
        autoPlay muted playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: 'block' }}
      />
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scaleX(-1)', pointerEvents: 'none' }}
      />

      {camError && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15,23,42,0.85)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem', textAlign: 'center', gap: '0.75rem',
        }}>
          <span style={{ fontSize: '2rem' }}>📷</span>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>{camError}</p>
        </div>
      )}

      {/* Corner brackets */}
      {['tl', 'tr', 'bl', 'br'].map(pos => (
        <div key={pos} style={{
          position: 'absolute',
          top: pos.startsWith('t') ? '0.625rem' : 'auto',
          bottom: pos.startsWith('b') ? '0.625rem' : 'auto',
          left: pos.endsWith('l') ? '0.625rem' : 'auto',
          right: pos.endsWith('r') ? '0.625rem' : 'auto',
          width: 14, height: 14,
          borderTop: pos.startsWith('t') ? '2px solid rgba(14,165,233,0.6)' : 'none',
          borderBottom: pos.startsWith('b') ? '2px solid rgba(14,165,233,0.6)' : 'none',
          borderLeft: pos.endsWith('l') ? '2px solid rgba(14,165,233,0.6)' : 'none',
          borderRight: pos.endsWith('r') ? '2px solid rgba(14,165,233,0.6)' : 'none',
        }} />
      ))}

      {/* Status bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '0.5rem 0.75rem',
        background: 'linear-gradient(to top, rgba(15,23,42,0.8), transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: modelReady ? '#10b981' : '#f59e0b',
            boxShadow: modelReady ? '0 0 8px rgba(16,185,129,0.6)' : 'none',
          }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.1em', color: '#94a3b8' }}>
            {modelReady ? 'FACE MESH ACTIVE' : 'LOADING MODEL…'}
          </span>
        </div>
        {isRecording && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#e11d48', animation: 'recordPulse 1s ease-in-out infinite' }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.58rem', color: '#fda4af', letterSpacing: '0.1em' }}>REC</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default WebcamRecorder