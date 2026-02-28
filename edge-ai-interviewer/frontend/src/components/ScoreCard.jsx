import { motion } from 'framer-motion'

const colorConfig = {
  sky: {
    primary: '#38bdf8',
    secondary: '#0ea5e9',
    glow: 'rgba(56,189,248,0.5)',
    bg: 'rgba(56,189,248,0.07)',
    border: 'rgba(56,189,248,0.18)',
    track: 'rgba(56,189,248,0.06)',
  },
  emerald: {
    primary: '#34d399',
    secondary: '#059669',
    glow: 'rgba(52,211,153,0.5)',
    bg: 'rgba(52,211,153,0.07)',
    border: 'rgba(52,211,153,0.18)',
    track: 'rgba(52,211,153,0.06)',
  },
  violet: {
    primary: '#a78bfa',
    secondary: '#7c3aed',
    glow: 'rgba(167,139,250,0.5)',
    bg: 'rgba(167,139,250,0.07)',
    border: 'rgba(167,139,250,0.18)',
    track: 'rgba(167,139,250,0.06)',
  },
  amber: {
    primary: '#fbbf24',
    secondary: '#d97706',
    glow: 'rgba(251,191,36,0.5)',
    bg: 'rgba(251,191,36,0.07)',
    border: 'rgba(251,191,36,0.18)',
    track: 'rgba(251,191,36,0.06)',
  },
}

const ScoreCard = ({ label, score, accent = 'sky' }) => {
  const pct = Math.round((score || 0) * 100)
  const c = colorConfig[accent] || colorConfig.sky

  // SVG circle gauge
  const r = 22
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      style={{
        borderRadius: '1.125rem',
        border: `1px solid ${c.border}`,
        background: 'rgba(8,20,40,0.75)',
        backdropFilter: 'blur(12px)',
        padding: '1rem 1.125rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        transition: 'border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease',
        cursor: 'default',
        boxShadow: `0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02) inset`,
      }}
      whileHover={{
        y: -2,
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${c.glow}22`,
      }}
    >
      {/* Left: label + sub + bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.62rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: c.primary,
          textShadow: `0 0 12px ${c.glow}`,
          marginBottom: '0.2rem',
        }}>{label}</p>
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.75rem',
          color: '#1e293b',
          marginBottom: '0.625rem',
        }}>
          Local model output
        </p>

        {/* Progress bar */}
        <div style={{ height: 3, borderRadius: 99, background: c.track, overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            style={{
              height: '100%',
              borderRadius: 99,
              background: `linear-gradient(90deg, ${c.secondary}, ${c.primary})`,
              boxShadow: `0 0 8px ${c.glow}`,
            }}
          />
        </div>
      </div>

      {/* Right: SVG gauge */}
      <div style={{ position: 'relative', width: 58, height: 58, flexShrink: 0 }}>
        <svg width="58" height="58" style={{ transform: 'rotate(-90deg)' }}>
          {/* Track */}
          <circle
            cx="29" cy="29" r={r}
            fill="none"
            stroke={c.track}
            strokeWidth="3"
          />
          {/* Progress */}
          <motion.circle
            cx="29" cy="29" r={r}
            fill="none"
            stroke={c.primary}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: `drop-shadow(0 0 4px ${c.glow})` }}
          />
        </svg>

        {/* Center number */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}>
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: '0.9375rem',
            fontWeight: 700,
            color: c.primary,
            textShadow: `0 0 12px ${c.glow}`,
            lineHeight: 1,
          }}>{pct}</span>
        </div>
      </div>
    </motion.div>
  )
}

export default ScoreCard