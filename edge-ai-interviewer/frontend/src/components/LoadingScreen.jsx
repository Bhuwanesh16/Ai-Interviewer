/**
 * LoadingScreen.jsx — restructured UI
 *
 * Changes from original:
 * - Spinner + label moved to horizontal row (compact, scannable)
 * - Sub-label grouped under step text as caption
 * - Pip track as divider between header and step list
 * - Step list uses border-bottom per row
 * - Removed framer-motion — plain CSS transitions only
 * - All colors via CSS variables (light/dark safe)
 */

import { useEffect, useState } from 'react'

const STEPS = [
  { icon: '🎬', text: 'Preparing media',               time: '~1s' },
  { icon: '🎙️', text: 'Transcribing & speech signals', time: '~2s' },
  { icon: '🧠', text: 'Scoring content & presence',    time: '~2s' },
  { icon: '📊', text: 'Assembling session report',     time: '~1s' },
]

/* ─── CSS injected once ──────────────────────────────────── */
const GLOBAL_CSS = `
@keyframes ls-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes ls-dot-blink {
  0%, 66% { opacity: 1; }
  67%, 100% { opacity: 0; }
}
.ls-arc {
  transform-origin: 24px 24px;
  animation: ls-spin 1.1s linear infinite;
}
.ls-icon-enter {
  animation: ls-fade-in 0.2s ease forwards;
}
@keyframes ls-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`

/* ─── Blink dots ─────────────────────────────────────────── */
const BlinkDots = () => (
  <>
    {[0, 1, 2].map(i => (
      <span
        key={i}
        style={{
          animation: `ls-dot-blink 1.2s ${i * 0.2}s infinite`,
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
        borderBottom: '0.5px solid var(--color-border-tertiary)',
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
      {/* status dot */}
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
  const [visible, setVisible] = useState(false)

  // Fade in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  // Advance steps
  useEffect(() => {
    const t = setInterval(() => setStepIdx(i => (i + 1) % STEPS.length), 1400)
    return () => clearInterval(t)
  }, [])

  const step = STEPS[stepIdx]

  return (
    <>
      <style>{GLOBAL_CSS}</style>

      {/* Overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(2, 6, 15, 0.55)',
          backdropFilter: 'blur(12px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(12px) saturate(1.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s',
        }}
      >
        {/* Card */}
        <div
          style={{
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-secondary)',
            borderRadius: 20,
            padding: '2rem',
            width: 'min(340px, 88vw)',
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.94)',
            opacity: visible ? 1 : 0,
            transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.3s',
          }}
        >
          {/* Header label */}
          <p
            style={{
              fontSize: '0.6875rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--color-text-tertiary)',
              margin: '0 0 1.5rem',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Session analysis
          </p>

          {/* ── Spinner + label row ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* Spinner */}
            <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
              <svg
                viewBox="0 0 48 48"
                fill="none"
                style={{ position: 'absolute', inset: 0, width: 48, height: 48 }}
              >
                {/* track */}
                <circle
                  cx="24" cy="24" r="19"
                  stroke="var(--color-border-tertiary)"
                  strokeWidth="2.5"
                />
                {/* spinning arc */}
                <circle
                  cx="24" cy="24" r="19"
                  stroke="var(--color-text-info)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="119"
                  strokeDashoffset="89"
                  className="ls-arc"
                />
              </svg>

              {/* Icon — key forces re-mount for fade-in */}
              <span
                key={stepIdx}
                className="ls-icon-enter"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                }}
              >
                {step.icon}
              </span>
            </div>

            {/* Label block */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.9375rem',
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {step.text}
                <BlinkDots />
              </div>
              <div
                style={{
                  fontSize: '0.6875rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-tertiary)',
                  marginTop: 2,
                }}
              >
                Real-time multi‑signal scoring
              </div>
            </div>
          </div>

          {/* ── Pip track ── */}
          <div
            style={{
              display: 'flex',
              gap: 5,
              alignItems: 'center',
              marginBottom: '1.5rem',
            }}
          >
            {STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  height: 4,
                  borderRadius: 99,
                  width: i === stepIdx ? 20 : 6,
                  background:
                    i === stepIdx
                      ? 'var(--color-text-info)'
                      : 'var(--color-border-secondary)',
                  transition: 'width 0.25s, background 0.25s',
                }}
              />
            ))}
          </div>

          {/* ── Step list ── */}
          <div>
            {STEPS.map((s, i) => (
              <StepRow
                key={i}
                step={s}
                state={i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'pending'}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export default LoadingScreen