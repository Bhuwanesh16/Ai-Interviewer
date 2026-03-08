/**
 * RadarChart.jsx
 *
 * Bugs fixed:
 *  - Score key mismatch: the component read `scores.final` but the result
 *    endpoint returns `final_score` (and the scoring service returns
 *    `final_score` too). Similarly, `scores.nlp` should be `scores.nlp_score`
 *    when the data comes from the DB response shape. The component now accepts
 *    BOTH shapes via a resolve helper so it works with:
 *      a) Live analyze-chunk responses  { facial, speech }           (floats)
 *      b) Full result responses         { facial_score, speech_score,
 *                                         nlp_score, final_score }  (floats)
 *      c) Scoring service output        { final_score, weights_used } (floats)
 *
 *  - `linearGradient` inside `<defs>` inside `<ReRadarChart>` is NOT
 *    supported by Recharts' radar chart — the SVG `<defs>` block must be
 *    placed outside the Recharts component tree (it never renders the fill
 *    gradient, the radar area just appears transparent). Fixed by wrapping
 *    with a raw SVG overlay approach: `fill` now uses a plain semi-transparent
 *    color and an inlined SVG `<defs>` pattern is injected via a wrapper.
 *    Simplest correct fix: use `fillOpacity` with a solid color rather than
 *    a gradient that Recharts cannot resolve.
 *
 *  - "Content" (NLP) radar point showed 0 whenever transcription failed, which
 *    visually distorts the chart. If NLP score is null/undefined the data
 *    point is now excluded from the chart and a "Content analysis disabled"
 *    label is shown below instead of a misleading zero spike.
 *
 *  - Added `animationDuration` on Radar for a smooth draw-in on first render.
 *
 *  - `scores` prop is now validated: if null or undefined the component
 *    returns null rather than crashing on `scores.facial`.
 */

import {
  Radar,
  RadarChart as ReRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'

// ── Score resolution ──────────────────────────────────────────────────────────

/**
 * Accept both API response shapes:
 *   Live chunks : { facial, speech }                          (0-1 floats)
 *   DB results  : { facial_score, speech_score, nlp_score, final_score }
 *   Mixed       : anything in between
 *
 * Returns normalised { facial, speech, nlp, final } all as 0-100 ints or null.
 */
const resolveScores = (scores) => {
  if (!scores) return null
  const to100 = (v) => {
    const n = parseFloat(v)
    return isNaN(n) ? null : Math.round(n * 100)
  }
  return {
    facial: to100(scores.facial ?? scores.facial_score),
    speech: to100(scores.speech ?? scores.speech_score),
    nlp:    to100(scores.nlp    ?? scores.nlp_score),
    final:  to100(scores.final  ?? scores.final_score),
  }
}

// ── Colour tokens ─────────────────────────────────────────────────────────────

const STROKE   = '#0ea5e9'
const FILL     = 'rgba(14,165,233,0.18)'
const GRID     = 'rgba(148,163,184,0.2)'
const AXIS_FG  = '#64748b'

// ── Component ─────────────────────────────────────────────────────────────────

const RadarChart = ({ scores }) => {
  const s = resolveScores(scores)
  if (!s) return null

  // Build data array — exclude NLP point if unavailable so the chart shape
  // is not distorted by a false zero
  const hasNlp = s.nlp !== null

  const data = [
    { metric: 'Presence', value: s.facial ?? 0 },
    { metric: 'Speech',   value: s.speech  ?? 0 },
    ...(hasNlp ? [{ metric: 'Content', value: s.nlp }] : []),
    { metric: 'Overall',  value: s.final   ?? 0 },
  ]

  return (
    <div style={{
      borderRadius: '1.25rem',
      border: '1px solid rgba(148,163,184,0.2)',
      background: 'rgba(255,255,255,0.97)',
      padding: '1.25rem',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      {/* Label */}
      <p style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '0.62rem',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#64748b',
        marginBottom: '0.75rem',
      }}>
        Multi-modal profile
      </p>

      {/* Chart */}
      <div style={{ height: 256 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ReRadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
            <PolarGrid stroke={GRID} />

            <PolarAngleAxis
              dataKey="metric"
              tick={{
                fill: AXIS_FG,
                fontSize: 11,
                fontFamily: "'DM Sans', sans-serif",
              }}
            />

            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tickCount={4}
              tick={{ fill: '#94a3b8', fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}
              tickLine={false}
              axisLine={false}
            />

            {/*
              FIX: fill uses a plain rgba colour — linearGradient via <defs>
              inside ReRadarChart is not rendered by Recharts for Radar fills.
              Use fillOpacity + solid stroke for a clean look that actually works.
            */}
            <Radar
              name="Score"
              dataKey="value"
              stroke={STROKE}
              strokeWidth={2.5}
              fill={FILL}
              fillOpacity={1}
              dot={{ fill: STROKE, r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: STROKE }}
              animationDuration={700}
              animationEasing="ease-out"
            />
          </ReRadarChart>
        </ResponsiveContainer>
      </div>

      {/* Score summary row */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        marginTop: '0.5rem',
        justifyContent: 'center',
      }}>
        {[
          { label: 'Presence', value: s.facial },
          { label: 'Speech',   value: s.speech },
          ...(hasNlp ? [{ label: 'Content', value: s.nlp }] : []),
          { label: 'Overall',  value: s.final,  bold: true },
        ].map(({ label, value, bold }) => (
          <div key={label} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0.35rem 0.65rem',
            borderRadius: '8px',
            background: 'rgba(248,250,252,0.8)',
            border: bold
              ? '1px solid rgba(14,165,233,0.25)'
              : '1px solid rgba(226,232,240,0.8)',
            minWidth: 54,
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: bold ? '1rem' : '0.85rem',
              fontWeight: bold ? 800 : 600,
              color: bold ? '#0ea5e9' : '#334155',
              lineHeight: 1.1,
            }}>
              {value !== null ? value : '—'}
            </span>
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.6rem',
              color: '#94a3b8',
              marginTop: '0.15rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* NLP disabled note */}
      {!hasNlp && (
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.68rem',
          color: '#94a3b8',
          textAlign: 'center',
          marginTop: '0.6rem',
          fontStyle: 'italic',
        }}>
          Content axis hidden — transcription unavailable
        </p>
      )}
    </div>
  )
}

export default RadarChart