import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchHistory } from '../services/api'

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
  const navigate = useNavigate()
  const location = useLocation()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  // Compute aggregate metrics from sessions
  const latestSession = sessions.length > 0 ? sessions[0] : null
  const latestResponse = latestSession?.responses?.length > 0
    ? latestSession.responses[latestSession.responses.length - 1]
    : null

  const liveMetrics = latestResponse
    ? [
      { label: 'Emotion', value: latestResponse.facial_score != null ? (latestResponse.facial_score * 100).toFixed(0) : '—', color: '#10b981', glow: 'rgba(16,185,129,0.3)', sub: 'Facial expression' },
      { label: 'Speech', value: latestResponse.speech_score != null ? (latestResponse.speech_score * 100).toFixed(0) : '—', color: '#0ea5e9', glow: 'rgba(14,165,233,0.3)', sub: 'Pace & clarity' },
      { label: 'Content', value: latestResponse.nlp_score != null ? (latestResponse.nlp_score * 100).toFixed(0) : '—', color: '#8b5cf6', glow: 'rgba(139,92,246,0.3)', sub: 'Relevance' },
    ]
    : [
      { label: 'Emotion', value: '—', color: '#10b981', glow: 'rgba(16,185,129,0.3)', sub: 'Facial expression' },
      { label: 'Speech', value: '—', color: '#0ea5e9', glow: 'rgba(14,165,233,0.3)', sub: 'Pace & clarity' },
      { label: 'Content', value: '—', color: '#8b5cf6', glow: 'rgba(139,92,246,0.3)', sub: 'Relevance' },
    ]

  const overallScore = latestSession?.overall_score
    ? Math.round(latestSession.overall_score * 100)
    : null

  // Re-fetch history every time the user navigates to Home (location.key changes on each visit)
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setIsLoggedIn(false)
      return
    }
    setIsLoggedIn(true)
    setLoading(true)
    fetchHistory()
      .then(({ data }) => {
        setSessions(data.sessions || [])
      })
      .catch((err) => {
        console.error('Failed to load history', err)
        if (err.response?.status === 401) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          setIsLoggedIn(false)
        }
      })
      .finally(() => setLoading(false))
  }, [location.key])

  const fmtDate = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '3rem 1.5rem' }}>

      {/* ── Hero ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '3rem',
        alignItems: 'center',
        marginBottom: '3rem',
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
            color: '#0ea5e9',
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
            color: '#0f172a',
            marginBottom: '1.25rem',
          }}>
            Practice smarter.<br />
            <span style={{
              background: 'linear-gradient(135deg, #0ea5e9 0%, #059669 50%, #7c3aed 100%)',
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
              to={isLoggedIn ? "/interview" : "/register"}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.7rem 1.5rem',
                borderRadius: '99px',
                background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                color: '#fff',
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: '0.875rem',
                textDecoration: 'none',
                boxShadow: '0 2px 16px rgba(14,165,233,0.35)',
                transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {isLoggedIn ? 'Start an interview →' : 'Get started →'}
            </Link>
            {!isLoggedIn && (
              <Link
                to="/interview"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.7rem 1.5rem',
                  borderRadius: '99px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(255,255,255,0.9)',
                  color: '#475569',
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  textDecoration: 'none',
                  transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                Try a mock interview
              </Link>
            )}
          </div>
        </motion.div>

        {/* Feature side / Graphic placeholder */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}
        >
          {liveMetrics.map((m, i) => (
            <div key={i} style={{ padding: '1.25rem', borderRadius: '1.25rem', background: '#fff', border: '1px solid rgba(148,163,184,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem', fontFamily: "'JetBrains Mono', monospace" }}>{m.label}</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 800, color: m.color, fontFamily: "'Syne', sans-serif" }}>{m.value}</p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* ── Real-time Feedback Summary ── */}
      {isLoggedIn && latestSession && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          style={{
            marginBottom: '3rem',
            padding: '1.75rem',
            borderRadius: '1.5rem',
            background: 'linear-gradient(145deg, rgba(255,255,255,0.9), rgba(248,250,252,0.8))',
            border: '1px solid rgba(14,165,233,0.15)',
            boxShadow: '0 10px 30px -15px rgba(14,165,233,0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: '0.75rem', background: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}>
                <span style={{ fontSize: '1.25rem' }}>📋</span>
              </div>
              <div>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.125rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Latest Performance Summary</h2>
                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>Based on your last session for <b>{latestSession.position}</b></p>
              </div>
            </div>
            <Link
              to={`/result/${latestSession.session_id}`}
              style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0ea5e9', textDecoration: 'none' }}
            >
              Full analysis →
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {[
              { label: 'Expression', score: latestResponse?.facial_score, color: '#10b981', icon: '😊' },
              { label: 'Voice clarity', score: latestResponse?.speech_score, color: '#0ea5e9', icon: '🎙️' },
              { label: 'Relevance', score: latestResponse?.nlp_score, color: '#8b5cf6', icon: '🎯' }
            ].map((m, i) => (
              <div key={i} style={{ padding: '1rem', borderRadius: '1rem', background: '#fff', border: '1px solid rgba(148,163,184,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>{m.icon} {m.label}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: m.color }}>{m.score ? Math.round(m.score * 100) : '--'}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(148,163,184,0.1)', overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(m.score || 0) * 100}%` }}
                    style={{ height: '100%', background: m.color, borderRadius: 2 }}
                  />
                </div>
              </div>
            ))}
          </div>

          <p style={{
            fontSize: '0.85rem',
            lineHeight: 1.6,
            color: '#475569',
            background: 'rgba(148,163,184,0.03)',
            padding: '1rem',
            borderRadius: '0.75rem',
            borderLeft: '3px solid #0ea5e9',
            margin: 0
          }}>
            <b>Growth Tip:</b> {
              latestResponse?.facial_score < 0.6 ? "Try maintaining a bit more energy in your facial expressions to project confidence." :
                latestResponse?.speech_score < 0.6 ? "Working on a steady pace will significantly improve your clarity score." :
                  latestResponse?.nlp_score < 0.6 ? "Integrating more specific keywords from the job description can boost your relevance." :
                    "Your performance is looking solid! Continue refining your STAR method delivery for maximum impact."
            }
          </p>
        </motion.div>
      )}

      {/* ── Past Interview History ── */}
      {isLoggedIn && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          style={{ marginBottom: '3rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.65rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#0ea5e9',
            }}>Your interview history</p>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '1rem' }}>No history found.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {sessions.map((session) => {
                const overallPct = session.overall_score != null ? Math.round(session.overall_score * 100) : null
                const scoreClr = overallPct == null ? '#94a3b8' : overallPct >= 80 ? '#10b981' : overallPct >= 60 ? '#0ea5e9' : '#f43f5e'
                const scoreBg = overallPct == null ? 'rgba(148,163,184,0.06)' : overallPct >= 80 ? 'rgba(16,185,129,0.06)' : overallPct >= 60 ? 'rgba(14,165,233,0.06)' : 'rgba(244,63,94,0.06)'
                return (
                  <div
                    key={session.session_id}
                    onClick={() => navigate(`/result/${session.session_id}`)}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(14,165,233,0.3)'
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(14,165,233,0.08)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'rgba(148,163,184,0.2)'
                      e.currentTarget.style.boxShadow = 'none'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                    style={{
                      borderRadius: '1.25rem', padding: '1.25rem', background: '#fff',
                      border: '1px solid rgba(148,163,184,0.2)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                    }}
                  >
                    <div>
                      <h4 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: '0.9375rem', color: '#0f172a' }}>{session.position}</h4>
                      <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#64748b' }}>{fmtDate(session.started_at)}</p>
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem'
                    }}>
                      <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
                        View report →
                      </span>
                      <div style={{
                        textAlign: 'center', minWidth: 60, padding: '0.5rem 0.875rem',
                        borderRadius: '0.75rem', background: scoreBg,
                        border: `1px solid ${scoreClr}33`,
                      }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: scoreClr, display: 'block', lineHeight: 1 }}>
                          {overallPct ?? '--'}
                        </span>
                        <span style={{ fontSize: '0.55rem', color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}>SCORE</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Features ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        {features.map((f, i) => (
          <div key={i} style={{ padding: '1.5rem', borderRadius: '1.25rem', background: '#fff', border: '1px solid rgba(148,163,184,0.1)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{f.icon}</div>
            <h4 style={{ margin: '0 0 0.5rem', fontFamily: "'Syne', sans-serif" }}>{f.title}</h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.6 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Home