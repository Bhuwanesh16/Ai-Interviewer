import { useEffect, useRef } from 'react'

const AudioWave = ({ mediaStream, isRecording, onSpeechScore }) => {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const lastScoreRef = useRef(0)
  const lastUpdateRef = useRef(0)

  useEffect(() => {
    if (!mediaStream) return
    const canvas = canvasRef.current
    if (!canvas) return

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const source = audioCtx.createMediaStreamSource(mediaStream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.82
    source.connect(analyser)
    audioContextRef.current = audioCtx
    analyserRef.current = analyser

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    const ctx = canvas.getContext('2d')

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      // Calculate a basic speech score (average activity)
      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i]
      }
      const avg = sum / bufferLength / 255

      // Throttle updates to avoid state thrashing if used directly in parent
      const now = performance.now()
      if (onSpeechScore && now - lastUpdateRef.current > 300) {
        // Boost slightly for better visualization of normal speech
        const boostedScore = Math.min(1, avg * 3)
        onSpeechScore(boostedScore)
        lastUpdateRef.current = now
      }

      const dpr = window.devicePixelRatio || 1
      const w = canvas.offsetWidth * dpr
      const h = canvas.offsetHeight * dpr
      canvas.width = w
      canvas.height = h

      // Background
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(2,6,15,0)'
      ctx.fillRect(0, 0, w, h)

      const barCount = 80
      const gap = 2
      const barW = (w - gap * (barCount - 1)) / barCount

      for (let i = 0; i < barCount; i++) {
        const index = Math.floor((i / barCount) * bufferLength * 0.75)
        const value = dataArray[index] / 255

        const minH = h * 0.04
        const barH = Math.max(minH, value * h * 0.88)
        const x = i * (barW + gap)
        const y = (h - barH) / 2

        // Color based on energy
        const hue = 190 + value * 40
        const sat = 70 + value * 30
        const lum = 45 + value * 25

        const grad = ctx.createLinearGradient(0, y, 0, y + barH)
        grad.addColorStop(0, `hsla(${hue}, ${sat}%, ${lum + 15}%, ${0.4 + value * 0.6})`)
        grad.addColorStop(0.5, `hsla(${hue}, ${sat}%, ${lum}%, ${0.6 + value * 0.4})`)
        grad.addColorStop(1, `hsla(${hue + 20}, ${sat - 10}%, ${lum - 10}%, ${0.3 + value * 0.5})`)

        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(x, y, barW, barH, barW / 2)
        ctx.fill()

        // Glow on active bars
        if (value > 0.4) {
          ctx.shadowColor = `hsla(${hue}, 90%, 65%, 0.5)`
          ctx.shadowBlur = 6
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }
    }

    draw()

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (audioContextRef.current) audioContextRef.current.close()
    }
  }, [mediaStream, onSpeechScore])

  return (
    <div style={{
      borderRadius: '1.25rem',
      border: `1px solid ${isRecording ? 'rgba(14,165,233,0.3)' : 'rgba(148,163,184,0.25)'}`,
      background: 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(12px)',
      padding: '1rem',
      transition: 'border-color 0.3s ease',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isRecording ? '#0ea5e9' : '#94a3b8',
            boxShadow: isRecording ? '0 0 6px rgba(14,165,233,0.5)' : 'none',
            transition: 'all 0.3s ease',
            animation: isRecording ? 'recordPulse 1.4s ease-in-out infinite' : 'none',
          }} />
          <span style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.8rem',
            fontWeight: 500,
            color: '#475569',
            transition: 'color 0.3s ease',
          }}>
            Live speech energy
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: isRecording ? '#0ea5e9' : '#64748b',
            transition: 'color 0.3s ease',
          }}>
            {isRecording ? 'Active' : 'Idle'}
          </span>
          {isRecording && (
            <span style={{
              padding: '0.15rem 0.45rem',
              borderRadius: '99px',
              background: 'rgba(14,165,233,0.08)',
              border: '1px solid rgba(14,165,233,0.25)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.55rem',
              letterSpacing: '0.1em',
              color: '#0ea5e9',
            }}>FFT 512</span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div style={{
        borderRadius: '0.75rem',
        overflow: 'hidden',
        background: 'rgba(248,250,252,0.9)',
        border: '1px solid rgba(148,163,184,0.2)',
        height: 80,
        position: 'relative',
      }}>
        {/* Idle state overlay */}
        {!isRecording && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
          }}>
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: 4 + Math.sin(i * 0.5) * 2,
                  borderRadius: 99,
                  background: 'rgba(14,165,233,0.12)',
                }}
              />
            ))}
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>

      {/* Frequency labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem' }}>
        {['Bass', 'Mid', 'Treble'].map(f => (
          <span key={f} style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.55rem',
            letterSpacing: '0.08em',
            color: '#0f172a',
          }}>{f}</span>
        ))}
      </div>
    </div>
  )
}

export default AudioWave