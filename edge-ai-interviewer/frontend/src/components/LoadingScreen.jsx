/**
 * LoadingScreen.jsx — professional UI refresh
 *
 * Changes:
 * - Replaced hardcoded hex colors with CSS variables (light/dark mode safe)
 * - Added step list with live done/active/pending state
 * - Pulse ring on spinner for depth without blur/glow
 * - Animated icon and label transitions via JS (no framer-motion quirks)
 * - Dots rendered as individual spans for staggered blink
 * - Pip track uses smooth width transition
 * - Removed heavy box-shadow, backdrop-filter kept for overlay
 */

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const STEPS = [
  { icon: '🎬', text: 'Processing your video response', time: '~1s' },
  { icon: '🎙️', text: 'Analysing speech clarity',       time: '~1s' },
  { icon: '🧠', text: 'Scoring content relevance',      time: '~1s' },
  { icon: '📊', text: 'Generating performance report',  time: '~1s' },
]

/* ─── Blink dots ─────────────────────────────────────────── */
const blinkKeyframes = `
@keyframes dot-blink {
  0%, 66% { opacity: 1; }
  67%, 100% { opacity: 0; }
}
@keyframes pulse-ring {
  0%, 100% { opacity: 0.15; }
  50%       { opacity: 0.35; }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`

const BlinkDots = () => (
  <>
    <style>{blinkKeyframes}</style>
    {[0, 1, 2].map(i => (
      <span
        key={i}
        style={{
          animation: `dot-blink 1.2s ${i * 0.2}s infinite`,
          display: 'inline-block',
        }}
      >
        .
      </span>
    ))}
  </>
)

/* ─── Step row ───────────────────────────────────────────── */
const StepRow = ({ step, state }) => {
  const isDone   = state === 'done'
  const isActive = state === 'active'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderTop: '0.5px solid var(--color-border-tertiary)',
        fontSize: '0.8125rem',
        color: isDone
          ? 'var(--color-text-success)'
          : isActive
          ? 'var(--color-text-primary)'
          : 'var(--color-text-tertiary)',
        fontWeight: isActive ? 500 : 400,
        transition: 'color 0.25s',
      }}
    >
      {/* indicator dot */}
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: isDone
            ? 'var(--color-background-success)'
            : isActive
            ? 'var(--color-background-info)'
            : 'var(--color-border-secondary)',
          outline: isDone
            ? '1.5px solid var(--color-border-success)'
            : isActive
            ? '1.5px solid var(--color-border-info)'
            : 'none',
          transition: 'background 0.25s, outline 0.25s',
        }}
      />
      <span style={{ flex: 1, lineHeight: 1.4 }}>{step.text}</span>
      <span
        style={{
          fontSize: '0.6875rem',
          minWidth: 28,
          textAlign: 'right',
          color: isDone ? 'var(--color-text-success)' : 'var(--color-text-tertiary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {isDone ? '✓' : step.time}
      </span>
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────── */
const LoadingScreen = () => {
  const [stepIdx, setStepIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setStepIdx(i => (i + 1) % STEPS.length), 1200)
    return () => clearInterval(t)
  }, [])

  const step = STEPS[stepIdx]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-secondary)',
          borderRadius: 20,
          padding: '2.25rem 2.5rem',
          textAlign: 'center',
          width: 'min(360px, 88vw)',
        }}
      >
        {/* ── Spinner ── */}
        <div
          style={{
            position: 'relative',
            width: 64,
            height: 64,
            margin: '0 auto 1.5rem',
          }}
        >
          {/* pulse ring */}
          <div
            style={{
              position: 'absolute',
              inset: -6,
              borderRadius: '50%',
              border: '1px solid var(--color-border-info)',
              animation: 'pulse-ring 2.2s ease-in-out infinite',
            }}
          />
          {/* track + arc */}
          <svg
            style={{ position: 'absolute', inset: 0 }}
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="32" cy="32" r="26"
              stroke="var(--color-border-tertiary)"
              strokeWidth="3.5"
            />
            <circle
              cx="32" cy="32" r="26"
              stroke="var(--color-text-info)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray="163"
              strokeDashoffset="122"
              style={{
                transformOrigin: '32px 32px',
                animation: 'spin 1.1s linear infinite',
              }}
            />
          </svg>
          {/* animated icon */}
          <AnimatePresence mode="wait">
            <motion.span
              key={stepIdx}
              initial={{ opacity: 0, scale: 0.55 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.55 }}
              transition={{ duration: 0.18 }}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              {step.icon}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* ── Step label ── */}
        <div
          style={{
            fontSize: '0.9375rem',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            minHeight: '2.4em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.375rem',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={stepIdx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              {step.text}
            </motion.span>
          </AnimatePresence>
          <BlinkDots />
        </div>

        {/* ── Sub-label ── */}
        <p
          style={{
            fontSize: '0.6875rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
            margin: '0 0 1.75rem',
          }}
        >
          Parallel multi-modal analysis
        </p>

        {/* ── Pip track ── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, alignItems: 'center' }}>
          {STEPS.map((_, i) => (
            <motion.div
              key={i}
              animate={{
                width: i === stepIdx ? 20 : 6,
                background:
                  i === stepIdx
                    ? 'var(--color-text-info)'
                    : 'var(--color-border-secondary)',
              }}
              transition={{ duration: 0.25 }}
              style={{ height: 5, borderRadius: 99 }}
            />
          ))}
        </div>

        {/* ── Step list ── */}
        <div style={{ marginTop: '1.25rem' }}>
          {STEPS.map((s, i) => (
            <StepRow
              key={i}
              step={s}
              state={i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'pending'}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default LoadingScreen