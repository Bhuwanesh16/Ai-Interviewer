import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

const metrics = [
  { label: 'Emotion', value: '0.78', color: '#34d399', glow: 'rgba(52,211,153,0.5)', sub: 'Facial expression' },
  { label: 'Speech',  value: '0.83', color: '#38bdf8', glow: 'rgba(56,189,248,0.5)', sub: 'Pace & clarity' },
  { label: 'Content', value: '0.81', color: '#a78bfa', glow: 'rgba(167,139,250,0.5)', sub: 'Relevance' },
]

const features = [
  {
    icon: '⬡',
    title: 'Edge-based AI',
    desc: 'Webcam and mic stay on-device. Local models, no cloud required.',
  },
  {
    icon: '◈',
    title: 'Multi-modal scoring',
    desc: 'Facial expression, speech patterns, and content relevance — all fused into one score.',
  },
  {
    icon: '◎',
    title: 'Real-time feedback',
    desc: 'See your performance break down instantly after each answer.',
  },
]

const Home = () => {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '3rem 1.5rem' }}>

      {/* ── Hero ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '3rem',
        alignItems: 'center',
        marginBottom: '5rem',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.7rem',
            letterSpacing: '0.18em',
            color: '#38bdf8',
            textShadow: '0 0 20px rgba(56,189,248,0.5)',
            textTransform: 'uppercase',
            marginBottom: '1rem',
          }}>
            Edge-Based AI Interviewer
          </p>

          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 'clamp(2rem, 5vw, 3.25rem)',
            lineHeight: 1.1,
            letterSpacing: '-0.04em',
            color: '#f0f9ff',
            marginBottom: '1.25rem',
          }}>
            Practice smarter.<br />
            <span style={{
              background: 'linear-gradient(135deg, #38bdf8 0%, #34d399 50%, #a78bfa 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Perform better.
            </span>
          </h1>

          <p style={{
            fontSize: '0.9375rem',
            color: '#64748b',
            lineHeight: 1.75,
            maxWidth: 460,
            marginBottom: '2rem',
          }}>
            Real-time emotion, speech clarity, and content analysis — powered by
            local AI models. Your data never leaves your device.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Link
              to="/register"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.7rem 1.5rem',
                borderRadius: '99px',
                background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
                color: '#031220',
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: '0.875rem',
                textDecoration: 'none',
                boxShadow: '0 0 24px rgba(56,189,248,0.35), 0 4px 16px rgba(0,0,0,0.4)',
                transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              Get started →
            </Link>
            <Link
              to="/interview"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.7rem 1.5rem',
                borderRadius: '99px',
                border: '1px solid rgba(148,163,184,0.18)',
                background: 'rgba(8,20,40,0.5)',
                color: '#94a3b8',
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
                fontSize: '0.875rem',
                textDecoration: 'none',
                transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              Try a mock interview
            </Link>
          </div>
        </motion.div>

        {/* Preview card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'relative' }}
        >
          {/* Glow blob */}
          <div style={{
            position: 'absolute',
            inset: '-3rem',
            background: 'radial-gradient(ellipse at 50% 50%, rgba(56,189,248,0.1) 0%, rgba(167,139,250,0.06) 40%, transparent 70%)',
            filter: 'blur(40px)',
            pointerEvents: 'none',
            animation: 'float 10s ease-in-out infinite',
          }} />

          <div style={{
            position: 'relative',
            borderRadius: '1.5rem',
            border: '1px solid rgba(56,189,248,0.12)',
            background: 'rgba(8,20,40,0.8)',
            backdropFilter: 'blur(16px)',
            padding: '1.5rem',
            boxShadow: '0 4px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <span style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: '#64748b',
              }}>
                Interview snapshot
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span style={{
                  width: 6, height: 6,
                  borderRadius: '50%',
                  background: '#34d399',
                  boxShadow: '0 0 6px rgba(52,211,153,0.7)',
                }} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#334155' }}>
                  live · local GPU
                </span>
              </div>
            </div>

            {/* Metric cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
              {metrics.map((m, i) => (
                <motion.div
                  key={m.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                  style={{
                    borderRadius: '1rem',
                    border: '1px solid rgba(56,189,248,0.08)',
                    background: 'rgba(2,6,15,0.7)',
                    padding: '0.875rem 0.75rem',
                    transition: 'border-color 0.25s ease, transform 0.25s ease',
                    cursor: 'default',
                  }}
                  whileHover={{ borderColor: m.glow, y: -3 }}
                >
                  <p style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.6rem',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#334155',
                    marginBottom: '0.375rem',
                  }}>{m.label}</p>
                  <p style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: '1.375rem',
                    fontWeight: 700,
                    color: m.color,
                    textShadow: `0 0 20px ${m.glow}`,
                    lineHeight: 1,
                    marginBottom: '0.3rem',
                  }}>{m.value}</p>
                  <p style={{ fontSize: '0.65rem', color: '#1e293b' }}>{m.sub}</p>
                </motion.div>
              ))}
            </div>

            {/* Mini bar */}
            <div style={{
              height: 4,
              borderRadius: 99,
              background: 'rgba(56,189,248,0.06)',
              overflow: 'hidden',
            }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '82%' }}
                transition={{ delay: 0.6, duration: 1, ease: [0.16,1,0.3,1] }}
                style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #0ea5e9, #38bdf8, #34d399)',
                  boxShadow: '0 0 12px rgba(56,189,248,0.5)',
                  borderRadius: 99,
                }}
              />
            </div>
            <p style={{ fontSize: '0.65rem', color: '#1e293b', marginTop: '0.4rem' }}>
              Overall performance: 82 / 100
            </p>
          </div>
        </motion.div>
      </div>

      {/* ── Feature grid ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
      >
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.65rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: '#38bdf8',
          marginBottom: '1.5rem',
          textShadow: '0 0 16px rgba(56,189,248,0.4)',
        }}>How it works</p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
        }}>
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
              style={{
                borderRadius: '1.25rem',
                border: '1px solid rgba(56,189,248,0.07)',
                background: 'rgba(8,20,40,0.6)',
                backdropFilter: 'blur(12px)',
                padding: '1.5rem',
                transition: 'border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease',
                cursor: 'default',
              }}
              whileHover={{
                borderColor: 'rgba(56,189,248,0.2)',
                y: -3,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(56,189,248,0.07)',
              }}
            >
              <div style={{
                width: 36, height: 36,
                borderRadius: '0.625rem',
                background: 'rgba(56,189,248,0.08)',
                border: '1px solid rgba(56,189,248,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem',
                marginBottom: '1rem',
                color: '#38bdf8',
              }}>{f.icon}</div>
              <h3 style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: '0.9375rem',
                fontWeight: 700,
                color: '#e2e8f0',
                marginBottom: '0.5rem',
              }}>{f.title}</h3>
              <p style={{ fontSize: '0.8125rem', color: '#475569', lineHeight: 1.65 }}>{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

export default Home