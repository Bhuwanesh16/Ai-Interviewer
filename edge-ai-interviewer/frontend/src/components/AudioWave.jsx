/**
 * AudioWave.jsx — Performance-optimized v2
 *
 * Fixes for violations:
 *
 * 1. onSpeechScore throttled from 4Hz → 2Hz (every 30 frames at 60fps).
 *    Each call triggers a setState in the parent (Interview.jsx), which
 *    schedules a re-render. At 4Hz that's 4 re-renders/sec on top of
 *    MediaPipe. At 2Hz it's 2 — matches our MediaPipe flush rate.
 *
 * 2. setAvgDb (local state) also throttled to match — was updating at 4Hz
 *    causing an extra local re-render every 250ms.
 *
 * 3. onSpeechScore now stored in a ref so the draw loop always calls the
 *    latest version without needing to be in the useEffect dependency array.
 *    This prevents the entire audio pipeline from tearing down and rebuilding
 *    whenever the parent re-renders and passes a new function reference.
 *
 * 4. ResizeObserver added to keep canvas pixel width in sync with layout.
 *
 * 5. AudioContext reuse and close-on-unmount kept from v1.
 */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

const AudioWave = ({ mediaStream, isRecording, onSpeechScore }) => {
  const canvasRef      = useRef(null)
  const ctxRef         = useRef(null)      // AudioContext
  const analyserRef    = useRef(null)
  const rafRef         = useRef(null)
  const smoothRef      = useRef(0)         // EMA accumulator
  const frameRef       = useRef(0)         // frame counter for throttle
  const onSpeechRef    = useRef(onSpeechScore) // stable ref — no pipeline rebuild
  const resizeObsRef   = useRef(null)

  const [avgDb, setAvgDb] = useState(0)

  // Keep speech callback ref current without triggering useEffect
  useEffect(() => { onSpeechRef.current = onSpeechScore }, [onSpeechScore])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (!mediaStream || !isRecording) {
      cancelAnimationFrame(rafRef.current)
      const ctx2d = canvas.getContext('2d')
      ctx2d?.clearRect(0, 0, canvas.width, canvas.height)
      smoothRef.current = 0
      frameRef.current  = 0
      return
    }

    // Reuse or create AudioContext
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const audioCtx = ctxRef.current

    // Resume if suspended (browser autoplay policy)
    if (audioCtx.state === 'suspended') audioCtx.resume()

    const analyser = audioCtx.createAnalyser()
    analyser.fftSize        = 256
    analyser.smoothingTimeConstant = 0.8  // built-in smoothing from Web Audio API
    analyserRef.current = analyser

    const source = audioCtx.createMediaStreamSource(mediaStream)
    source.connect(analyser)

    const bufLen  = analyser.frequencyBinCount
    const dataArr = new Uint8Array(bufLen)
    const ctx2d   = canvas.getContext('2d')

    // FIX: ResizeObserver keeps canvas pixel width in sync with layout width
    if (resizeObsRef.current) resizeObsRef.current.disconnect()
    resizeObsRef.current = new ResizeObserver(() => {
      if (canvas.width !== canvas.clientWidth) {
        canvas.width = canvas.clientWidth || 300
      }
    })
    resizeObsRef.current.observe(canvas)

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      if (!ctx2d) return

      if (canvas.width !== canvas.clientWidth && canvas.clientWidth > 0) {
        canvas.width = canvas.clientWidth
      }

      analyser.getByteTimeDomainData(dataArr)
      ctx2d.clearRect(0, 0, canvas.width, canvas.height)

      const W    = canvas.width
      const H    = canvas.height
      const barW = 3
      const gap  = 2
      const cols = Math.floor(W / (barW + gap))

      // RMS energy
      let sum = 0
      for (let i = 0; i < bufLen; i++) {
        const v = (dataArr[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / bufLen)

      // EMA smoothing — α=0.15
      smoothRef.current = 0.15 * rms + 0.85 * smoothRef.current
      const energy = Math.min(smoothRef.current * 8, 1)

      // FIX: throttle to 2Hz (every 30 frames) — was 4Hz (every 15 frames)
      // Matches the MediaPipe flush rate so parent re-renders stay in sync
      frameRef.current += 1
      if (frameRef.current % 30 === 0) {
        onSpeechRef.current?.(energy)   // uses ref — no pipeline rebuild
        setAvgDb(Math.round(energy * 100))
      }

      // Draw waveform bars
      for (let i = 0; i < cols; i++) {
        const idx       = Math.floor((i / cols) * bufLen)
        const amplitude = Math.abs((dataArr[idx] - 128) / 128)
        const barH      = Math.max(3, amplitude * H * 0.9)

        const t = i / cols
        const r = Math.round(14  + t * (139 - 14))
        const g = Math.round(165 + t * (92  - 165))
        const b = Math.round(233 + t * (246 - 233))
        ctx2d.fillStyle = `rgba(${r},${g},${b},${0.55 + amplitude * 0.45})`

        ctx2d.beginPath()
        if (ctx2d.roundRect) {
          ctx2d.roundRect(i * (barW + gap), (H - barH) / 2, barW, barH, 1)
        } else {
          ctx2d.rect(i * (barW + gap), (H - barH) / 2, barW, barH)
        }
        ctx2d.fill()
      }
    }

    draw()

    return () => {
      cancelAnimationFrame(rafRef.current)
      resizeObsRef.current?.disconnect()
      try { source.disconnect() } catch { /* already disconnected */ }
    }
  }, [mediaStream, isRecording]) // onSpeechScore intentionally excluded — using ref

  // Close AudioContext on unmount to free OS audio resource
  useEffect(() => {
    return () => {
      resizeObsRef.current?.disconnect()
      ctxRef.current?.close()
    }
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.5 }}
      style={{
        borderRadius: '1.25rem',
        border: '1px solid rgba(148,163,184,0.2)',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(12px)',
        padding: '1rem 1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.6rem', letterSpacing: '0.14em',
          textTransform: 'uppercase', color: '#64748b', margin: 0,
        }}>
          Audio Signal
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isRecording && (
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#0ea5e9',
              boxShadow: '0 0 8px rgba(14,165,233,0.6)',
              animation: 'recordPulse 1.2s ease-in-out infinite',
            }} />
          )}
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.65rem',
            color: isRecording ? '#0ea5e9' : '#94a3b8',
          }}>
            {isRecording ? `${avgDb}%` : 'idle'}
          </span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        height={56}
        style={{
          width: '100%',
          display: 'block',
          borderRadius: '0.5rem',
          background: 'rgba(248,250,252,0.6)',
        }}
      />

      {!isRecording && (
        <p style={{
          textAlign: 'center', marginTop: '0.5rem',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.72rem', color: '#94a3b8',
        }}>
          Microphone idle — press Start Recording
        </p>
      )}
    </motion.div>
  )
}

export default AudioWave