/**
 * StatusPill.jsx
 *
 * Bugs fixed / improvements:
 *  - The original file had no bugs per se, but `pulse` was applied as a
 *    className that references a CSS class `recording-dot` which is only
 *    defined in index.css. When the component is used outside that stylesheet
 *    context (e.g. Storybook, isolated tests) the pulse animation silently
 *    fails. The pulse animation is now self-contained via a CSS keyframe
 *    injected once into the document head — no external stylesheet dependency.
 *  - `value` is now optional: if undefined/null, the value span is omitted
 *    so the pill can be used as a pure label badge (e.g. "● LIVE").
 *  - Added `title` attribute for accessibility (screen readers + hover tooltip).
 *  - Added `onClick` prop support so pills can act as toggle buttons
 *    (e.g. toggling camera/mic state).
 *  - Exported the VARIANTS map as a named export so consuming components can
 *    reference variant colour values without duplicating them.
 */

import { motion } from 'framer-motion'
import { useEffect } from 'react'

// ── Variants ──────────────────────────────────────────────────────────────────

export const VARIANTS = {
  ok: {
    bg:     'rgba(16,185,129,0.08)',
    border: 'rgba(16,185,129,0.25)',
    fg:     '#059669',
    dot:    '#10b981',
  },
  warn: {
    bg:     'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.25)',
    fg:     '#d97706',
    dot:    '#f59e0b',
  },
  err: {
    bg:     'rgba(244,63,94,0.08)',
    border: 'rgba(244,63,94,0.25)',
    fg:     '#e11d48',
    dot:    '#fb7185',
  },
  info: {
    bg:     'rgba(14,165,233,0.08)',
    border: 'rgba(14,165,233,0.25)',
    fg:     '#0284c7',
    dot:    '#0ea5e9',
  },
}

// ── Pulse keyframe injection (runs once) ──────────────────────────────────────

const STYLE_ID = 'status-pill-pulse'

const injectPulseKeyframe = () => {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes statusPillPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.4; transform: scale(0.75); }
    }
    .status-pill-pulse {
      animation: statusPillPulse 1.4s ease-in-out infinite;
    }
  `
  document.head.appendChild(style)
}

// ── Component ─────────────────────────────────────────────────────────────────

const StatusPill = ({
  label,
  value,
  variant = 'info',
  pulse = false,
  onClick,
  title,
}) => {
  useEffect(() => {
    if (pulse) injectPulseKeyframe()
  }, [pulse])

  const v = VARIANTS[variant] ?? VARIANTS.info
  const isClickable = typeof onClick === 'function'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      title={title ?? (value !== undefined ? `${label}: ${value}` : label)}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && onClick(e) : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: '0.35rem 0.75rem',
        borderRadius: 999,
        border: `1px solid ${v.border}`,
        background: v.bg,
        color: v.fg,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '0.62rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'opacity 0.15s ease',
      }}
    >
      {/* Status dot — pulses when recording */}
      <span
        className={pulse ? 'status-pill-pulse' : undefined}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: v.dot,
          boxShadow: `0 0 8px ${v.dot}66`,
          flexShrink: 0,
        }}
      />

      {/* Label */}
      <span style={{ opacity: 0.85 }}>{label}</span>

      {/* Value — omitted if not provided */}
      {value !== undefined && value !== null && (
        <span style={{ fontWeight: 700 }}>{value}</span>
      )}
    </motion.div>
  )
}

export default StatusPill