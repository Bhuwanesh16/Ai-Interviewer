import { useLocation, useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import RadarChart from '../components/RadarChart'
import { fetchResult } from '../services/api'

const ScoreMeter = ({ label, score, color, glow, delay = 0 }) => {
  const pct = Math.round((score || 0) * 100)
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        borderRadius: '1rem',
        border: '1px solid rgba(148,163,184,0.2)',
        background: 'rgba(255,255,255,0.95)',
        padding: '1.125rem 1.25rem',
        transition: 'border-color 0.25s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.625rem' }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.65rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#475569',
        }}>{label}</span>
        <span style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: '1.125rem',
          fontWeight: 700,
          color,
          textShadow: `0 0 16px ${glow}`,
        }}>{pct}<span style={{ fontSize: '0.65rem', color: '#334155', fontFamily: "'JetBrains Mono', monospace" }}>/100</span></span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: 'rgba(56,189,248,0.05)', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ delay: delay + 0.2, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          style={{
            height: '100%',
            borderRadius: 99,
            background: `linear-gradient(90deg, ${color}99, ${color})`,
            boxShadow: `0 0 10px ${glow}`,
          }}
        />
      </div>
    </motion.div>
  )
}

const Result = () => {
  const { sessionId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [scores, setScores] = useState(location.state?.scores || {
    facial: 0, speech: 0, nlp: 0, final: 0,
  })
  const [transcript, setTranscript] = useState(
    location.state?.transcript || ''
  )
  const [feedback, setFeedback] = useState(location.state?.feedback || '')
  const [suggestions, setSuggestions] = useState(location.state?.suggestions || [])
  const [metrics, setMetrics] = useState(location.state?.metrics || {})
  const [loadingResult, setLoadingResult] = useState(!location.state)

  useEffect(() => {
    if (!sessionId || location.state) return
    const load = async () => {
      try {
        setLoadingResult(true)
        const { data } = await fetchResult(sessionId)
        const last = data.responses?.[data.responses.length - 1]
        if (last) {
          setScores({ facial: last.facial_score, speech: last.speech_score, nlp: last.nlp_score, final: last.final_score })
          setTranscript(last.transcript)
          setFeedback(last.feedback || '')
          setSuggestions(last.suggestions || [])
          setMetrics(last.metrics || {})
        }
      } catch (err) {
        console.error('Failed to load result', err)
      } finally {
        setLoadingResult(false)
      }
    }
    load()
  }, [sessionId, location.state])

  const finalPct = Math.round((scores.final || 0) * 100)
  const scoreColor = finalPct >= 80 ? '#10b981' : finalPct >= 60 ? '#0ea5e9' : '#f43f5e'
  const scoreGlow = finalPct >= 80 ? 'rgba(16,185,129,0.3)' : finalPct >= 60 ? 'rgba(14,165,233,0.3)' : 'rgba(244,63,94,0.3)'

  if (loadingResult) {
    return (
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '4rem 1.5rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh',
      }}>
        <span style={{
          width: 28, height: 28,
          borderRadius: '50%',
          border: '2px solid rgba(14,165,233,0.15)',
          borderTopColor: '#0ea5e9',
          display: 'inline-block',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '1rem',
        }} />
        <span style={{ fontSize: '0.875rem', color: '#64748b', fontFamily: "'DM Sans', sans-serif" }}>
          Loading your results…
        </span>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'space-between', alignItems: 'flex-end' }}
      >
        <div>
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.65rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#0ea5e9',
            marginBottom: '0.5rem',
          }}>
            Session feedback
          </p>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
            letterSpacing: '-0.04em',
            color: '#0f172a',
            marginBottom: '0.5rem',
          }}>
            Multi-modal analysis
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#475569', maxWidth: 480, lineHeight: 1.65 }}>
            Scores computed from facial expression, speech patterns, and semantic content. Use them to iterate on your delivery.
          </p>
        </div>

        {/* Final score badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          style={{
            borderRadius: '1.25rem',
            border: `1px solid ${scoreColor}33`,
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)',
            padding: '1rem 1.5rem',
            textAlign: 'right',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.06)',
          }}
        >
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#64748b',
            marginBottom: '0.25rem',
          }}>Final score</p>
          <p style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: '2.75rem',
            fontWeight: 800,
            lineHeight: 1,
            color: scoreColor,
          }}>
            {finalPct}
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}> /100</span>
          </p>
        </motion.div>
      </motion.div>

      {/* ── Score cards + Radar ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <ScoreMeter label="Emotion signal" score={scores.facial} color="#10b981" glow="rgba(16,185,129,0.4)" delay={0.1} />
          <ScoreMeter label="Speech clarity" score={scores.speech} color="#0ea5e9" glow="rgba(14,165,233,0.4)" delay={0.2} />
          <ScoreMeter label="Content relevance" score={scores.nlp} color="#8b5cf6" glow="rgba(139,92,246,0.4)" delay={0.3} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          style={{
            borderRadius: '1.25rem',
            border: '1px solid rgba(148,163,184,0.25)',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <RadarChart scores={scores} />
        </motion.div>
      </div>

      {/* ── Transcript + Feedback ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '1rem',
      }}>
        {/* Feedback Section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          style={{
            borderRadius: '1.25rem',
            border: '1px solid rgba(148,163,184,0.25)',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)',
            padding: '1.25rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.6rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#64748b',
            }}>AI Performance Report</p>
            {metrics.verdict && (
              <span style={{
                fontSize: '0.6rem', padding: '2px 8px', borderRadius: 99,
                background: 'rgba(14,165,233,0.1)', color: '#0ea5e9', fontWeight: 700
              }}>
                {metrics.verdict}
              </span>
            )}
          </div>
          <p style={{
            fontSize: '0.925rem',
            lineHeight: 1.7,
            color: '#1e293b',
            fontWeight: 500,
            marginBottom: '1rem',
          }}>{feedback || 'Analyzing your performance results...'}</p>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
            gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1.25rem',
            borderTop: '1px solid rgba(148,163,184,0.15)'
          }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.6rem', color: '#64748b', marginBottom: '0.25rem' }}>WORD COUNT</p>
              <p style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{metrics.word_count || 0}</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.6rem', color: '#64748b', marginBottom: '0.25rem' }}>FILLER RATIO</p>
              <p style={{ fontSize: '1.125rem', fontWeight: 800, color: '#f59e0b' }}>{metrics.filler_word_frequency || '0.00'}</p>
              <p style={{ fontSize: '0.55rem', color: '#94a3b8' }}>({metrics.filler_count || 0} hits)</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.6rem', color: '#64748b', marginBottom: '0.25rem' }}>PACE</p>
              <p style={{ fontSize: '1rem', fontWeight: 700, color: '#0ea5e9' }}>{metrics.speaking_rate || 'Optimal'}</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.6rem', color: '#64748b', marginBottom: '0.25rem' }}>SENTIMENT</p>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#10b981' }}>{metrics.sentiment_profile || 'Professional'}</p>
            </div>
          </div>
        </motion.div>

        {/* Suggestions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.5 }}
          style={{
            borderRadius: '1.25rem',
            border: '1px solid rgba(148,163,184,0.25)',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)',
            padding: '1.25rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#64748b',
            marginBottom: '0.875rem',
          }}>Personalized Improvements</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {suggestions.map((tip, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.08 }}
                style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}
              >
                <div style={{
                  width: 20, height: 20,
                  borderRadius: '50%',
                  background: 'rgba(14,165,233,0.08)',
                  border: '1px solid rgba(14,165,233,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 2,
                }}>
                  <span style={{
                    fontSize: '0.55rem',
                    fontFamily: "'JetBrains Mono', monospace",
                    color: '#0ea5e9',
                  }}>{i + 1}</span>
                </div>
                <p style={{ fontSize: '0.8375rem', color: '#475569', lineHeight: 1.65, fontFamily: "'DM Sans', sans-serif" }}>
                  {tip}
                </p>
              </motion.div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 1rem',
                borderRadius: '99px',
                border: '1px solid rgba(148,163,184,0.3)',
                background: 'rgba(255,255,255,0.9)',
                color: '#64748b',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.75rem', fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(14,165,233,0.4)'
                e.currentTarget.style.color = '#0ea5e9'
                e.currentTarget.style.background = 'rgba(14,165,233,0.06)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(148,163,184,0.3)'
                e.currentTarget.style.color = '#64748b'
                e.currentTarget.style.background = 'rgba(255,255,255,0.9)'
              }}
            >
              ← Back to home
            </button>
            <button
              onClick={() => window.print()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 1rem',
                borderRadius: '99px',
                border: '1px solid rgba(148,163,184,0.3)',
                background: 'rgba(255,255,255,0.9)',
                color: '#64748b',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.75rem', fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(14,165,233,0.4)'
                e.currentTarget.style.color = '#0ea5e9'
                e.currentTarget.style.background = 'rgba(14,165,233,0.06)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(148,163,184,0.3)'
                e.currentTarget.style.color = '#64748b'
                e.currentTarget.style.background = 'rgba(255,255,255,0.9)'
              }}
            >
              ↓ Download report
            </button>
            <button
              onClick={() => navigate('/interview')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 1rem',
                borderRadius: '99px',
                border: 'none',
                background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                color: '#fff',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.75rem', fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 12px rgba(14,165,233,0.35)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(14,165,233,0.45)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 2px 12px rgba(14,165,233,0.35)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              Practice again →
            </button>
          </div>
        </motion.div>
      </div>

      {/* Transcript */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        style={{
          borderRadius: '1.25rem',
          border: '1px solid rgba(148,163,184,0.25)',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(12px)',
          padding: '1.25rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.6rem',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: '#64748b',
          marginBottom: '0.875rem',
        }}>Full Transcript</p>
        <p style={{
          fontSize: '0.8125rem',
          lineHeight: 1.85,
          color: '#475569',
          whiteSpace: 'pre-wrap',
          borderLeft: '2px solid rgba(14,165,233,0.3)',
          paddingLeft: '0.875rem',
          fontFamily: "'DM Sans', sans-serif",
        }}>{transcript || 'No transcript available.'}</p>
      </motion.div>
    </div>
  )
}

export default Result