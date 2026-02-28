import { useLocation, useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import ScoreCard from '../components/ScoreCard'
import RadarChart from '../components/RadarChart'
import { fetchResult } from '../services/api'

const suggestions = [
  'Slow down slightly to give your key points more emphasis.',
  'Use concrete impact metrics (%, time saved, revenue) where possible.',
  'Mirror the role description language to increase perceived fit.',
]

const ScoreMeter = ({ label, score, color, glow, delay = 0 }) => {
  const pct = Math.round((score || 0) * 100)
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16,1,0.3,1] }}
      style={{
        borderRadius: '1rem',
        border: '1px solid rgba(56,189,248,0.07)',
        background: 'rgba(8,20,40,0.7)',
        padding: '1.125rem 1.25rem',
        transition: 'border-color 0.25s ease',
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
          transition={{ delay: delay + 0.2, duration: 0.9, ease: [0.16,1,0.3,1] }}
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
    facial: 0.78, speech: 0.83, nlp: 0.81, final: 0.82,
  })
  const [transcript, setTranscript] = useState(
    location.state?.transcript || 'This is a placeholder transcript showing your interview response.'
  )

  useEffect(() => {
    if (!sessionId || location.state) return
    const load = async () => {
      try {
        const { data } = await fetchResult(sessionId)
        const last = data.responses?.[data.responses.length - 1]
        if (last) {
          setScores({ facial: last.facial_score, speech: last.speech_score, nlp: last.nlp_score, final: last.final_score })
          setTranscript(last.transcript)
        }
      } catch (err) {
        console.error('Failed to load result', err)
      }
    }
    load()
  }, [sessionId, location.state])

  const finalPct = Math.round((scores.final || 0) * 100)

  const scoreColor = finalPct >= 80 ? '#34d399' : finalPct >= 60 ? '#38bdf8' : '#fb7185'
  const scoreGlow  = finalPct >= 80 ? 'rgba(52,211,153,0.6)' : finalPct >= 60 ? 'rgba(56,189,248,0.6)' : 'rgba(251,113,133,0.6)'

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
            color: '#38bdf8',
            textShadow: '0 0 16px rgba(56,189,248,0.4)',
            marginBottom: '0.5rem',
          }}>
            Session feedback
          </p>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
            letterSpacing: '-0.04em',
            color: '#f0f9ff',
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
            border: `1px solid ${scoreColor}22`,
            background: `rgba(8,20,40,0.8)`,
            backdropFilter: 'blur(12px)',
            padding: '1rem 1.5rem',
            textAlign: 'right',
            boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 30px ${scoreGlow}20`,
          }}
        >
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#334155',
            marginBottom: '0.25rem',
          }}>Final score</p>
          <p style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: '2.75rem',
            fontWeight: 800,
            lineHeight: 1,
            color: scoreColor,
            textShadow: `0 0 40px ${scoreGlow}`,
          }}>
            {finalPct}
            <span style={{ fontSize: '0.875rem', color: '#1e293b', fontFamily: "'JetBrains Mono', monospace" }}> /100</span>
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
          <ScoreMeter label="Emotion signal"    score={scores.facial} color="#34d399" glow="rgba(52,211,153,0.5)"  delay={0.1} />
          <ScoreMeter label="Speech clarity"   score={scores.speech} color="#38bdf8" glow="rgba(56,189,248,0.5)"  delay={0.2} />
          <ScoreMeter label="Content relevance" score={scores.nlp}   color="#a78bfa" glow="rgba(167,139,250,0.5)" delay={0.3} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          style={{
            borderRadius: '1.25rem',
            border: '1px solid rgba(56,189,248,0.07)',
            background: 'rgba(8,20,40,0.7)',
            backdropFilter: 'blur(12px)',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RadarChart scores={scores} />
        </motion.div>
      </div>

      {/* ── Transcript + Suggestions ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '1rem',
      }}>
        {/* Transcript */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          style={{
            borderRadius: '1.25rem',
            border: '1px solid rgba(56,189,248,0.07)',
            background: 'rgba(8,20,40,0.7)',
            backdropFilter: 'blur(12px)',
            padding: '1.25rem',
          }}
        >
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#334155',
            marginBottom: '0.875rem',
          }}>Transcript</p>
          <p style={{
            fontSize: '0.8125rem',
            lineHeight: 1.85,
            color: '#64748b',
            whiteSpace: 'pre-wrap',
            borderLeft: '2px solid rgba(56,189,248,0.15)',
            paddingLeft: '0.875rem',
            fontFamily: "'DM Sans', sans-serif",
          }}>{transcript}</p>
        </motion.div>

        {/* Suggestions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.5 }}
          style={{
            borderRadius: '1.25rem',
            border: '1px solid rgba(56,189,248,0.07)',
            background: 'rgba(8,20,40,0.7)',
            backdropFilter: 'blur(12px)',
            padding: '1.25rem',
          }}
        >
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#334155',
            marginBottom: '0.875rem',
          }}>Suggested improvements</p>

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
                  background: 'rgba(56,189,248,0.08)',
                  border: '1px solid rgba(56,189,248,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 2,
                }}>
                  <span style={{
                    fontSize: '0.55rem',
                    fontFamily: "'JetBrains Mono', monospace",
                    color: '#38bdf8',
                  }}>{i + 1}</span>
                </div>
                <p style={{ fontSize: '0.8375rem', color: '#64748b', lineHeight: 1.65, fontFamily: "'DM Sans', sans-serif" }}>
                  {tip}
                </p>
              </motion.div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.print()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 1rem',
                borderRadius: '99px',
                border: '1px solid rgba(148,163,184,0.15)',
                background: 'transparent',
                color: '#94a3b8',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.75rem', fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(56,189,248,0.4)'
                e.currentTarget.style.color = '#38bdf8'
                e.currentTarget.style.background = 'rgba(56,189,248,0.06)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(148,163,184,0.15)'
                e.currentTarget.style.color = '#94a3b8'
                e.currentTarget.style.background = 'transparent'
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
                background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
                color: '#031220',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.75rem', fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 16px rgba(56,189,248,0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 0 28px rgba(56,189,248,0.5)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 0 16px rgba(56,189,248,0.3)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              Practice again →
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default Result