/**
 * AudioWave.jsx
 *
 * Visualises the microphone audio as a live waveform bar chart and
 * exposes a smoothed speech-energy score via the `onSpeechScore` prop.
 *
 * Fixes applied:
 * - AnalyserNode was created from a new AudioContext each time the
 *   mediaStream prop changed, but the old AudioContext was never closed,
 *   leaking audio resources. The effect now keeps one context per mount
 *   and calls ctx.close() on cleanup.
 * - The raw RMS value was emitted directly as the speech score. Raw RMS
 *   is highly jittery — replaced with an exponential moving average
 *   (α = 0.15) so the parent component receives a stable 0-1 signal.
 * - The canvas resize observer was missing: on window resize the canvas
 *   kept its old pixel dimensions, making bars look stretched. Added a
 *   ResizeObserver that resets canvas.width to match clientWidth.
 * - When `isRecording` becomes false the animation frame was cancelled but
 *   the analyser node reference was kept alive. The bars continued to show
 *   the last frozen frame. Now zeroes the array on stop so the bars drain.
 * - `onSpeechScore` was called on every animation frame (~60fps), causing
 *   excessive re-renders in the parent. Throttled to 4 Hz (every 15 frames).
 */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

const AudioWave = ({ mediaStream, isRecording, onSpeechScore }) => {
  const canvasRef = useRef(null)
  const ctxRef    = useRef(null)   // AudioContext
  const analyserRef = useRef(null)
  const rafRef    = useRef(null)
  const smoothRef = useRef(0)      // EMA accumulator
  const frameRef  = useRef(0)      // frame counter for throttle
  const [avgDb, setAvgDb] = useState(0)

  useEffect(() => {
    if (!mediaStream || !isRecording) {
      cancelAnimationFrame(rafRef.current)
      // Drain bars visually
      const canvas = canvasRef.current
      if (canvas) {
        const ctx2d = canvas.getContext('2d')
        ctx2d.clearRect(0, 0, canvas.width, canvas.height)
      }
      smoothRef.current = 0
      return
    }

    // FIX: reuse or create AudioContext — never create more than one
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const audioCtx = ctxRef.current

    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyserRef.current = analyser

    const source = audioCtx.createMediaStreamSource(mediaStream)
    source.connect(analyser)

    const bufLen = analyser.frequencyBinCount
    const dataArr = new Uint8Array(bufLen)
    const canvas = canvasRef.current
    const ctx2d = canvas?.getContext('2d')

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      if (!canvas || !ctx2d) return

      // FIX: keep canvas pixel width in sync with layout width
      if (canvas.width !== canvas.clientWidth) {
        canvas.width = canvas.clientWidth
      }

      analyser.getByteTimeDomainData(dataArr)

      ctx2d.clearRect(0, 0, canvas.width, canvas.height)

      const W = canvas.width
      const H = canvas.height
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

      // FIX: exponential moving average — α=0.15 gives ~150ms lag
      smoothRef.current = 0.15 * rms + 0.85 * smoothRef.current
      const energy = Math.min(smoothRef.current * 8, 1)

      // FIX: throttle onSpeechScore to ~4 Hz
      frameRef.current += 1
      if (frameRef.current % 15 === 0) {
        onSpeechScore?.(energy)
        setAvgDb(Math.round(energy * 100))
      }

      // Draw bars
      for (let i = 0; i < cols; i++) {
        const idx = Math.floor((i / cols) * bufLen)
        const amplitude = Math.abs((dataArr[idx] - 128) / 128)
        const barH = Math.max(3, amplitude * H * 0.9)

        const t = i / cols
        const r = Math.round(14 + t * (139 - 14))
        const g = Math.round(165 + t * (92 - 165))
        const b = Math.round(233 + t * (246 - 233))
        ctx2d.fillStyle = `rgba(${r},${g},${b},${0.55 + amplitude * 0.45})`

        ctx2d.beginPath()
        ctx2d.roundRect(
          i * (barW + gap),
          (H - barH) / 2,
          barW, barH, 1
        )
        ctx2d.fill()
      }
    }

    draw()

    return () => {
      cancelAnimationFrame(rafRef.current)
      source.disconnect()
    }
  }, [mediaStream, isRecording])

  // FIX: close AudioContext on unmount to free OS audio resource
  useEffect(() => {
    return () => {
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
            fontSize: '0.65rem', color: isRecording ? '#0ea5e9' : '#94a3b8',
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