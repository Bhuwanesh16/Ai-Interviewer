import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const IntegrityWarning = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const sessionId = location.state?.sessionId
  const issue = location.state?.issue

  const title = 'Interview integrity alert'
  const subtitle = issue?.type === 'MULTIPLE_FACES'
    ? 'Multiple faces were detected during the session.'
    : 'An integrity issue was detected during the session.'

  return (
    <div style={{ maxWidth: 900, margin: '3.5rem auto', padding: '0 1.5rem' }}>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          borderRadius: '1.5rem',
          border: '1px solid rgba(244,63,94,0.25)',
          background: 'rgba(255,255,255,0.95)',
          padding: '2rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        }}
      >
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.65rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: '#e11d48',
          marginBottom: '0.5rem',
          fontWeight: 800,
        }}>
          Warning
        </p>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 900, letterSpacing: '-0.04em', margin: 0, color: '#0f172a' }}>
          {title}
        </h1>
        <p style={{ marginTop: '0.75rem', color: '#475569', lineHeight: 1.7 }}>
          {subtitle} For fairness, the session has been submitted and the detailed result view is disabled.
        </p>

        {sessionId && (
          <div style={{
            marginTop: '1rem',
            padding: '0.85rem 1rem',
            borderRadius: '0.9rem',
            border: '1px solid rgba(148,163,184,0.25)',
            background: 'rgba(248,250,252,0.8)',
            color: '#334155',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.75rem',
            overflowWrap: 'anywhere',
          }}>
            Session ID: {sessionId}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '0.85rem 1.25rem',
              borderRadius: '0.9rem',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(255,255,255,0.9)',
              color: '#64748b',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            ← Back to home
          </button>
          <button
            onClick={() => navigate('/interview')}
            style={{
              padding: '0.85rem 1.25rem',
              borderRadius: '0.9rem',
              border: 'none',
              background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
              color: '#fff',
              fontWeight: 900,
              fontSize: '0.95rem',
              cursor: 'pointer',
              boxShadow: '0 10px 25px -8px rgba(14,165,233,0.45)',
            }}
          >
            Start a new session →
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default IntegrityWarning

