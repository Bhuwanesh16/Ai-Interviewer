import { motion } from 'framer-motion'

const VARIANTS = {
  ok: {
    bg: 'rgba(16,185,129,0.08)',
    border: 'rgba(16,185,129,0.25)',
    fg: '#059669',
    dot: '#10b981',
  },
  warn: {
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.25)',
    fg: '#d97706',
    dot: '#f59e0b',
  },
  err: {
    bg: 'rgba(244,63,94,0.08)',
    border: 'rgba(244,63,94,0.25)',
    fg: '#e11d48',
    dot: '#fb7185',
  },
  info: {
    bg: 'rgba(14,165,233,0.08)',
    border: 'rgba(14,165,233,0.25)',
    fg: '#0284c7',
    dot: '#0ea5e9',
  },
}

const StatusPill = ({ label, value, variant = 'info', pulse = false }) => {
  const v = VARIANTS[variant] || VARIANTS.info
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.35rem 0.7rem',
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
      }}
    >
      <span
        className={pulse ? 'recording-dot' : undefined}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: v.dot,
          boxShadow: `0 0 10px ${v.dot}55`,
          flexShrink: 0,
        }}
      />
      <span style={{ opacity: 0.85 }}>{label}</span>
      <span style={{ opacity: 1, fontWeight: 700 }}>{value}</span>
    </motion.div>
  )
}

export default StatusPill
