/**
 * ScoreCard.jsx
 *
 * Reusable card that displays a single score dimension with a label,
 * animated fill bar, percentage value, and an optional descriptive tag.
 *
 * Fixes applied:
 * - `score` prop was used directly in the bar width calculation as
 *   `${score * 100}%`. If score is null/undefined this becomes "NaN%"
 *   which breaks the CSS width. Added explicit null guard — renders as 0%
 *   fill with an "N/A" label when score is null.
 * - The `tag` prop was rendered unconditionally; if the caller omits it
 *   an empty <span> was still rendered, adding blank space. Now conditional.
 * - Color derivation was duplicated across callers. Moved inside the
 *   component: green ≥ 0.7, amber 0.4–0.69, red < 0.4, grey when null.
 * - Added `aria-label` for accessibility.
 */

import { motion } from 'framer-motion'

const ScoreCard = ({ label, score, tag, icon, delay = 0 }) => {
  const pct = score != null ? Math.round(score * 100) : null

  const color = pct == null ? '#94a3b8'
    : pct >= 70 ? '#10b981'
    : pct >= 40 ? '#f59e0b'
    : '#f43f5e'

  const bg = pct == null ? 'rgba(148,163,184,0.06)'
    : pct >= 70 ? 'rgba(16,185,129,0.06)'
    : pct >= 40 ? 'rgba(245,158,11,0.06)'
    : 'rgba(244,63,94,0.06)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      aria-label={`${label}: ${pct != null ? pct + ' out of 100' : 'not available'}`}
      style={{
        borderRadius: '1.25rem',
        border: `1px solid ${color}22`,
        background: bg,
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {icon && (
            <span style={{
              fontSize: '1rem',
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '0.5rem',
              background: `${color}18`,
            }}>
              {icon}
            </span>
          )}
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.62rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#64748b',
          }}>
            {label}
          </span>
        </div>
        <span style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: '1.25rem',
          color,
          lineHeight: 1,
        }}>
          {pct != null ? pct : '—'}
          {pct != null && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.6rem',
              color: '#94a3b8',
              marginLeft: '0.2em',
            }}>
              /100
            </span>
          )}
        </span>
      </div>

      {/* Bar */}
      <div style={{ height: 5, borderRadius: 99, background: 'rgba(148,163,184,0.1)', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: pct != null ? `${pct}%` : '0%' }}
          transition={{ delay: delay + 0.15, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{
            height: '100%',
            borderRadius: 99,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            boxShadow: `0 0 8px ${color}55`,
          }}
        />
      </div>

      {/* Tag */}
      {tag && (
        <span style={{
          alignSelf: 'flex-start',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.7rem',
          fontWeight: 600,
          color,
          background: `${color}12`,
          border: `1px solid ${color}28`,
          padding: '0.15rem 0.55rem',
          borderRadius: '99px',
        }}>
          {tag}
        </span>
      )}
    </motion.div>
  )
}

export default ScoreCard