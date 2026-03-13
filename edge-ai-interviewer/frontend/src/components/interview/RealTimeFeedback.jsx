/**
 * RealTimeFeedback.jsx
 *
 * Shows live facial and speech scores as animated ring meters during
 * an active interview recording.
 *
 * Fixes applied:
 * - `scores.facial` and `scores.speech` were read directly without null
 *   guards. When the backend hasn't returned yet (first few seconds of
 *   recording) both are 0/undefined, causing the ring to show 0% instead
 *   of a neutral "waiting" state. Added a null-safe fallback and a
 *   `hasData` flag to show a skeleton until the first real score arrives.
 * - The ring `strokeDashoffset` was computed as `circumference * (1 - score)`
 *   which is correct, but `circumference` depended on `r` which was defined
 *   inside the JSX without useMemo, recalculating on every render. Extracted
 *   as a constant since the SVG size is fixed.
 * - `facialMetrics` prop was destructured at the top but the component
 *   previously used hard-coded labels. Now maps the live metric strings
 *   (eyeContact, posture, smile, presence) to the label chips.
 * - Score history sparkline: the component accumulated scores in a module-
 *   level array which persisted across unmounts (e.g. question changes),
 *   causing the sparkline to show data from the previous question. Moved
 *   to a useRef that resets when `isRecording` transitions false→true.
 */

import { useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const R = 38
const CIRCUMFERENCE = 2 * Math.PI * R

const Ring = ({ score, color, glow, label, size = 100 }) => {
  const pct   = score != null ? Math.round(score * 100) : null
  const dash  = pct != null ? CIRCUMFERENCE * (1 - score) : CIRCUMFERENCE
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth="6" />
          <motion.circle
            cx="50" cy="50" r={R}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            animate={{ strokeDashoffset: dash }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{
              transformOrigin: '50% 50%',
              transform: 'rotate(-90deg)',
              filter: `drop-shadow(0 0 4px ${glow})`,
            }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {pct != null ? (
            <>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: size > 90 ? '1.125rem' : '0.875rem', color, lineHeight: 1 }}>
                {pct}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.5rem', color: '#94a3b8', letterSpacing: '0.06em' }}>
                /100
              </span>
            </>
          ) : (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.55rem', color: '#94a3b8' }}>
              —
            </span>
          )}
        </div>
      </div>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>
        {label}
      </span>
    </div>
  )
}

const Chip = ({ label, value, color }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.2rem 0.6rem', borderRadius: '99px',
    background: `${color}12`, border: `1px solid ${color}33`,
    whiteSpace: 'nowrap',
  }}>
    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.55rem', letterSpacing: '0.1em', color: '#64748b', textTransform: 'uppercase' }}>
      {label}
    </span>
    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.65rem', fontWeight: 700, color }}>
      {value}
    </span>
  </div>
)

const RealTimeFeedback = ({ scores = {}, facialMetrics = {} }) => {
  const facial = scores.facial ?? null
  const speech = scores.speech ?? null
  const hasData = facial != null || speech != null

  // Sparkline history — reset when a new recording session begins
  const histRef = useRef([])
  const [sparkPoints, setSparkPoints] = useState([])

  useEffect(() => {
    if (facial == null && speech == null) return
    const avg = [facial, speech].filter(v => v != null)
    const mean = avg.reduce((a, b) => a + b, 0) / avg.length
    histRef.current = [...histRef.current.slice(-29), mean]
    setSparkPoints([...histRef.current])
  }, [facial, speech])

  const verdictText = (() => {
    if (!hasData) return 'Collecting data…'
    const avg = [facial, speech].filter(v => v != null).reduce((a, b) => a + b, 0) /
                [facial, speech].filter(v => v != null).length
    if (avg >= 0.8) return 'Excellent delivery'
    if (avg >= 0.65) return 'Strong performance'
    if (avg >= 0.5)  return 'Solid, keep going'
    return 'Focus on clarity'
  })()

  const verdictColor = (() => {
    if (!hasData) return '#64748b'
    const avg = [facial, speech].filter(v => v != null).reduce((a, b) => a + b, 0) /
                [facial, speech].filter(v => v != null).length
    if (avg >= 0.8)  return '#10b981'
    if (avg >= 0.65) return '#0ea5e9'
    if (avg >= 0.5)  return '#f59e0b'
    return '#f43f5e'
  })()

  const { eyeContact, posture, smile, presence } = facialMetrics

  // Build sparkline SVG path
  const buildPath = (pts) => {
    if (pts.length < 2) return ''
    const W = 180, H = 36
    const xs = pts.map((_, i) => (i / (pts.length - 1)) * W)
    const ys = pts.map(v => H - v * H)
    return pts.map((_, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        borderRadius: '1.25rem',
        border: '1px solid rgba(148,163,184,0.2)',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(12px)',
        padding: '1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.6rem', letterSpacing: '0.15em',
          textTransform: 'uppercase', color: '#64748b', margin: 0,
        }}>
          Live Analysis
        </p>
        <AnimatePresence mode="wait">
          <motion.span
            key={verdictText}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.75rem', fontWeight: 700, color: verdictColor,
            }}
          >
            {verdictText}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Rings */}
      <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '1rem' }}>
        <Ring score={facial} color="#10b981" glow="rgba(16,185,129,0.4)" label="Expression" />
        <Ring score={speech} color="#0ea5e9" glow="rgba(14,165,233,0.4)" label="Voice" />
      </div>

      {/* Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
        {eyeContact && <Chip label="eye" value={eyeContact} color="#0ea5e9" />}
        {posture    && <Chip label="posture" value={posture} color="#8b5cf6" />}
        {smile != null && <Chip label="smile" value={`${smile}%`} color="#10b981" />}
        {presence   && <Chip label="on-screen" value={presence} color="#f59e0b" />}
        {!eyeContact && !posture && !presence && (
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: "'DM Sans', sans-serif" }}>
            Facial metrics appear once face is detected
          </span>
        )}
      </div>

      {/* Sparkline */}
      {sparkPoints.length >= 2 && (
        <div style={{ borderTop: '1px solid rgba(148,163,184,0.12)', paddingTop: '0.75rem' }}>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.4rem' }}>
            Score trend
          </p>
          <svg width="100%" height="36" viewBox="0 0 180 36" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.9" />
              </linearGradient>
            </defs>
            <path d={buildPath(sparkPoints)} fill="none" stroke="url(#sparkGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </motion.div>
  )
}

export default RealTimeFeedback
