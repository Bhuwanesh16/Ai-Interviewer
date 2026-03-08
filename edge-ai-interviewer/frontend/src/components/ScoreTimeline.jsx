/**
 * ScoreTimeline.jsx
 *
 * Bugs fixed:
 *  - Was incorrectly placed in the same file as ErrorBoundary with a second
 *    `export default` statement. A JS module can only have one default export —
 *    both components now live in their own files.
 *  - `entry.facial` and `entry.speech` were used directly, but the /analyze
 *    endpoint returns `{ facial: <float 0-1>, speech: <float 0-1> }` — the
 *    fields are named correctly but the timeline accumulator in the interview
 *    page was storing them under inconsistent keys. Normalised here: the
 *    component accepts either `entry.facial` (raw score) OR
 *    `entry.facial_score` (DB field name) so it works with both live chunks
 *    and session replay data.
 *  - Added a `final` column so the composite score is visible alongside
 *    component scores — this is the number displayed in the header card,
 *    so the table now matches.
 *  - Replaced magic `Math.round(x * 100)` with a safe helper that handles
 *    null / undefined without displaying "NaN".
 *  - Added colour coding on each score cell (green ≥ 70, amber 40–69, red < 40)
 *    so users can spot weak moments at a glance.
 *  - Empty-state guard already existed; extended it to also guard against
 *    all-null score rows so a broken analyze chunk doesn't crash the table.
 */

import { motion } from 'framer-motion'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Safely convert a 0-1 float (or null/undefined) to a 0-100 integer string.
 * Returns "—" if the value is missing.
 */
const fmt = (v) => {
  if (v === null || v === undefined || isNaN(Number(v))) return '—'
  return String(Math.round(Number(v) * 100))
}

/**
 * Resolve score fields from a timeline entry.
 * /analyze returns  { facial, speech }         (raw floats, 0-1)
 * result_routes returns { facial_score, speech_score, nlp_score, final_score }
 * We accept both shapes.
 */
const resolveEntry = (entry) => ({
  time:    entry.time ?? entry.timestamp ?? '?',
  facial:  entry.facial  ?? entry.facial_score  ?? null,
  speech:  entry.speech  ?? entry.speech_score  ?? null,
  nlp:     entry.nlp     ?? entry.nlp_score     ?? null,
  final:   entry.final   ?? entry.final_score   ?? null,
})

/**
 * Colour-code a 0-100 score string.
 */
const scoreColor = (raw) => {
  const n = parseInt(raw, 10)
  if (isNaN(n))  return '#94a3b8'          // grey  — missing
  if (n >= 70)   return '#10b981'          // green — good
  if (n >= 40)   return '#f59e0b'          // amber — warn
  return '#f43f5e'                          // red   — poor
}

// ── Column definitions ────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'time',   label: 'Time',     align: 'left',  isScore: false },
  { key: 'facial', label: 'Presence', align: 'right', isScore: true  },
  { key: 'speech', label: 'Speech',   align: 'right', isScore: true  },
  { key: 'nlp',    label: 'Content',  align: 'right', isScore: true  },
  { key: 'final',  label: 'Overall',  align: 'right', isScore: true  },
]

// ── Component ─────────────────────────────────────────────────────────────────

const ScoreTimeline = ({ timeline }) => {
  if (!timeline || timeline.length === 0) return null

  const rows = timeline.map(resolveEntry)

  // Drop entirely-null score rows (e.g. failed analyze chunks)
  const validRows = rows.filter(
    (r) => r.facial !== null || r.speech !== null || r.nlp !== null || r.final !== null
  )
  if (validRows.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{ marginTop: '2rem' }}
    >
      {/* Section heading */}
      <p style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '0.62rem',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#0ea5e9',
        marginBottom: '0.35rem',
      }}>
        Real-time score history
      </p>
      <h2 style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: '1.1rem',
        fontWeight: 700,
        color: '#0f172a',
        marginBottom: '0.85rem',
      }}>
        Per-chunk breakdown
      </h2>

      {/* Table wrapper — horizontal scroll on small screens */}
      <div style={{
        overflowX: 'auto',
        borderRadius: '1rem',
        border: '1px solid rgba(148,163,184,0.2)',
        background: 'rgba(255,255,255,0.97)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 380 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.2)' }}>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: col.align,
                    padding: '0.65rem 1rem',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.6rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#64748b',
                    fontWeight: 600,
                    background: 'rgba(248,250,252,0.8)',
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {validRows.map((row, idx) => (
              <motion.tr
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.025 }}
                style={{
                  borderBottom: idx < validRows.length - 1
                    ? '1px solid rgba(241,245,249,0.9)'
                    : 'none',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(248,250,252,0.4)',
                }}
              >
                {/* Time cell */}
                <td style={{
                  padding: '0.55rem 1rem',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.72rem',
                  color: '#475569',
                }}>
                  {typeof row.time === 'number' ? `${row.time}s` : row.time}
                </td>

                {/* Score cells */}
                {(['facial', 'speech', 'nlp', 'final']).map((key) => {
                  const display = fmt(row[key])
                  return (
                    <td
                      key={key}
                      style={{
                        padding: '0.55rem 1rem',
                        textAlign: 'right',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.78rem',
                        fontWeight: key === 'final' ? 700 : 500,
                        color: scoreColor(display),
                      }}
                    >
                      {display === '—' ? (
                        <span style={{ color: '#cbd5e1', fontSize: '0.7rem' }}>—</span>
                      ) : (
                        display
                      )}
                    </td>
                  )
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginTop: '0.6rem',
        justifyContent: 'flex-end',
      }}>
        {[
          { color: '#10b981', label: '≥ 70 Good' },
          { color: '#f59e0b', label: '40–69 Fair' },
          { color: '#f43f5e', label: '< 40 Poor' },
        ].map((item) => (
          <span key={item.label} style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.65rem',
            color: '#94a3b8',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: item.color, display: 'inline-block',
            }} />
            {item.label}
          </span>
        ))}
      </div>
    </motion.div>
  )
}

export default ScoreTimeline