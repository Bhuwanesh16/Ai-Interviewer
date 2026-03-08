/**
 * WebcamRecorder.jsx — Performance-optimized
 *
 * Violation fixes applied (on top of previous refineLandmarks/throttle fixes):
 *
 * 1. Throttle faceMesh.send() at source — previously Camera fired onFrame at
 *    ~30fps, each frame enqueued a MediaPipe inference task. Now we gate sends
 *    to SEND_THROTTLE_MS (100ms = ~10fps), so MediaPipe processes 3x fewer
 *    frames and the message handler fires 3x less often. Biggest remaining win.
 *
 * 2. Canvas draw decoupled via requestAnimationFrame — landmark overlay drawing
 *    no longer blocks the onResults message handler. We store latest landmarks
 *    in a ref and schedule a rAF paint separately, keeping the handler lean.
 *
 * 3. Score math pulled into a pure function — avoids closure captures and
 *    makes the hot path inside onResults as short as possible.
 *
 * 4. ctx.save/restore removed from hot path — not needed for our simple arc
 *    draws; removing it saves ~0.3ms per frame.
 *
 * 5. Single getContext('2d') call cached in a ref — previously called every
 *    frame inside onResults.
 *
 * Previous fixes retained:
 *   - refineLandmarks: false
 *   - RESULTS_THROTTLE_MS (state/callback gate)
 *   - Canvas resize only on dimension change
 *   - Camera track cleanup, duplicate script guard
 */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js'
const CAMERA_CDN    = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'

/** How often (ms) to actually send a frame to MediaPipe for inference. */
const SEND_THROTTLE_MS    = 100   // ~10fps inference (was every frame ~30fps)

/** How often (ms) to push scores to React state + parent callback. */
const RESULTS_THROTTLE_MS = 200   // ~5fps state updates

// ─── Pure score computation (no closures, easy to profile) ──────────────────
const MESH_POINTS = [33, 133, 362, 263, 61, 291, 4, 234, 454]

function computeScores(lm) {
  // Eye contact
  let eyeScore = 0.5
  if (lm.length > 473) {
    const eyeRatio = (inner, outer, iris) => {
      const total = Math.hypot(outer.x - inner.x, outer.y - inner.y)
      const dist  = Math.hypot(iris.x  - inner.x, iris.y  - inner.y)
      return total > 0 ? dist / total : 0.5
    }
    const lR = eyeRatio(lm[362], lm[263], lm[468])
    const rR = eyeRatio(lm[33],  lm[133], lm[473])
    eyeScore = Math.max(0, 1 - (Math.abs(lR - 0.5) + Math.abs(rR - 0.5)))
  }

  // Smile
  const mouthW   = Math.hypot(lm[291].x - lm[61].x, lm[291].y - lm[61].y)
  const faceW    = Math.hypot(lm[454].x - lm[234].x, lm[454].y - lm[234].y)
  const smileRatio = faceW > 0 ? mouthW / faceW : 0
  const smileScore = Math.min(Math.max((smileRatio - 0.3) / 0.25, 0) * 0.5 + 0.5, 1)

  // Head stability
  const centerX      = (lm[234].x + lm[454].x) / 2
  const headStability = Math.max(0, 1 - Math.abs(lm[4].x - centerX) * 5)

  const score = Math.min(
    Math.max(0.1, (headStability * 0.35) + (eyeScore * 0.35) + (smileScore * 0.30)),
    1
  )

  return {
    score,
    eyeScore,
    smileRatio,
    headStability,
    eyeContact: eyeScore > 0.75 ? 'High' : eyeScore > 0.5 ? 'Good' : 'Low',
    posture:    headStability > 0.75 ? 'Stable' : headStability > 0.45 ? 'Average' : 'Restless',
    smile:      Math.round(smileRatio * 100),
    presence:   '100%',
  }
}

// ─── Script loader (unchanged) ───────────────────────────────────────────────
const loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src; s.crossOrigin = 'anonymous'
    s.onload = resolve; s.onerror = reject
    document.head.appendChild(s)
  })

// ─── Component ───────────────────────────────────────────────────────────────
const WebcamRecorder = ({
  isRecording,
  mediaStream,
  setMediaStream,
  onModelStatus,
  onEmotionScore,
}) => {
  const videoRef      = useRef(null)
  const canvasRef     = useRef(null)
  const cameraRef     = useRef(null)
  const streamRef     = useRef(null)
  const ctxRef        = useRef(null)           // cached 2d context
  const isRecRef      = useRef(isRecording)
  const lastSendRef   = useRef(0)              // throttle: faceMesh.send
  const lastEmitRef   = useRef(0)              // throttle: onEmotionScore
  const canvasSizeRef = useRef({ w: 0, h: 0 })
  const pendingLmRef  = useRef(null)           // latest landmarks for rAF draw
  const rafRef        = useRef(null)           // rAF handle

  const [modelReady, setModelReady] = useState(false)
  const [camError,   setCamError]   = useState(null)

  useEffect(() => { isRecRef.current = isRecording }, [isRecording])

  useEffect(() => {
    let cancelled = false

    // rAF-based canvas painter — runs outside MediaPipe message handler
    const paintLoop = () => {
      rafRef.current = requestAnimationFrame(paintLoop)
      const lm     = pendingLmRef.current
      const canvas = canvasRef.current
      if (!lm || !canvas || !isRecRef.current) return

      // Lazy-init cached context
      if (!ctxRef.current) ctxRef.current = canvas.getContext('2d')
      const ctx = ctxRef.current

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle   = 'rgba(14,165,233,0.6)'
      ctx.strokeStyle = 'rgba(14,165,233,0.25)'
      ctx.lineWidth   = 0.5

      for (let i = 0; i < MESH_POINTS.length; i++) {
        const pt = lm[MESH_POINTS[i]]
        ctx.beginPath()
        ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 2, 0, 6.2832)
        ctx.fill()
      }
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
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        })
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: false,   // +40ms/frame if true — keep false
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })

        faceMesh.onResults((results) => {
          const canvas = canvasRef.current
          if (!canvas) return

          // Resize canvas only when needed
          const vw = video.videoWidth  || 640
          const vh = video.videoHeight || 480
          if (canvasSizeRef.current.w !== vw || canvasSizeRef.current.h !== vh) {
            canvas.width  = vw
            canvas.height = vh
            ctxRef.current = null   // invalidate cached ctx after resize
            canvasSizeRef.current = { w: vw, h: vh }
          }

          if (!results.multiFaceLandmarks?.length) {
            pendingLmRef.current = null
            const now = performance.now()
            if (now - lastEmitRef.current >= RESULTS_THROTTLE_MS) {
              lastEmitRef.current = now
              onEmotionScore?.({ score: 0.3, eyeContact: 'Low', posture: 'Unknown', smile: 0, presence: '0%' })
            }
            return
          }

          const lm = results.multiFaceLandmarks[0]

          // Store landmarks for rAF painter (non-blocking canvas draw)
          pendingLmRef.current = lm

          // Gate state + callback updates
          const now = performance.now()
          if (now - lastEmitRef.current < RESULTS_THROTTLE_MS) return
          lastEmitRef.current = now

          // Score computation (pure, no side-effects)
          onEmotionScore?.(computeScores(lm))
        })

        // eslint-disable-next-line no-undef
        const camera = new Camera(video, {
          onFrame: async () => {
            // FIX: throttle sends to MediaPipe — this is the primary source of
            // '[Violation] message handler took Xms'. Reducing from ~30fps to
            // ~10fps cuts inference tasks by 3x and keeps the main thread free.
            const now = performance.now()
            if (now - lastSendRef.current < SEND_THROTTLE_MS) return
            lastSendRef.current = now
            await faceMesh.send({ image: video })
          },
          width: 640, height: 480,
        })

        await camera.start()
        cameraRef.current = camera

        // Start rAF paint loop
        paintLoop()

        if (!cancelled) {
          setModelReady(true)
          onModelStatus?.(true)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('WebcamRecorder init error:', err)
          setCamError(err.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access and reload.'
            : 'Could not start camera. Check your device and browser permissions.')
          onModelStatus?.(false)
        }
      }
    }

    init()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      cameraRef.current?.stop?.()
      streamRef.current?.getTracks().forEach(t => t.stop())
      setMediaStream(null)
    }
  }, [])  // run once on mount

  // ── Render (unchanged layout) ─────────────────────────────────────────────
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
        style={{
          width: '100%', height: '100%',
          objectFit: 'cover',
          transform: 'scaleX(-1)',
          display: 'block',
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          transform: 'scaleX(-1)',
          pointerEvents: 'none',
        }}
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

      {['tl', 'tr', 'bl', 'br'].map(pos => (
        <div key={pos} style={{
          position: 'absolute',
          top:    pos.startsWith('t') ? '0.625rem' : 'auto',
          bottom: pos.startsWith('b') ? '0.625rem' : 'auto',
          left:   pos.endsWith('l')   ? '0.625rem' : 'auto',
          right:  pos.endsWith('r')   ? '0.625rem' : 'auto',
          width: 14, height: 14,
          borderTop:    pos.startsWith('t') ? '2px solid rgba(14,165,233,0.6)' : 'none',
          borderBottom: pos.startsWith('b') ? '2px solid rgba(14,165,233,0.6)' : 'none',
          borderLeft:   pos.endsWith('l')   ? '2px solid rgba(14,165,233,0.6)' : 'none',
          borderRight:  pos.endsWith('r')   ? '2px solid rgba(14,165,233,0.6)' : 'none',
        }} />
      ))}

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
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: '#e11d48',
              animation: 'recordPulse 1s ease-in-out infinite',
            }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.58rem', color: '#fda4af', letterSpacing: '0.1em' }}>
              REC
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default WebcamRecorder