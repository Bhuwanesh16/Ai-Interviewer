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

  // All session data loaded from API
  const [allResponses, setAllResponses] = useState([])
  const [sessionOverallScore, setSessionOverallScore] = useState(null)
  const [sessionPosition, setSessionPosition] = useState('')
  const [loadingResult, setLoadingResult] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  // Displayed scores for the score meters (averaged across all responses, or from nav state)
  const [scores, setScores] = useState(location.state?.scores || { facial: 0, speech: 0, nlp: 0, final: 0 })
  const [transcript, setTranscript] = useState(location.state?.transcript || '')
  const [feedback, setFeedback] = useState(location.state?.feedback || '')
  const [suggestions, setSuggestions] = useState(location.state?.suggestions || [])
  const [metrics, setMetrics] = useState(location.state?.metrics || {})

  // Holistic session summary
  const [sessionSummary, setSessionSummary] = useState(null)
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState(0)

  useEffect(() => {
    if (!sessionId) return
    const load = async () => {
      try {
        setLoadingResult(true)
        setFetchError(false)
        const { data } = await fetchResult(sessionId)
        const responses = data.responses || []

        setAllResponses(responses)
        setSessionPosition(data.position || '')
        setSessionSummary(data.session_summary || null)

        if (data.overall_score != null) {
          setSessionOverallScore(data.overall_score)
        }

        if (responses.length > 0) {
          // Compute averaged scores for the RADAR/METERS (overall performance)
          const avg = (key) => {
            const vals = responses.map(r => r[key] || 0)
            return vals.reduce((a, b) => a + b, 0) / vals.length
          }
          setScores({
            facial: avg('facial_score'),
            speech: avg('speech_score'),
            nlp: avg('nlp_score'),
            final: data.overall_score || avg('final_score'),
          })

          // Initial selection
          const initial = responses[0]
          setTranscript(initial.transcript || '')
          setFeedback(initial.feedback || '')
          setSuggestions(initial.suggestions || [])
          setMetrics(initial.metrics || {})
        }
      } catch (err) {
        console.error('Failed to load result', err)
        setFetchError(true)
      } finally {
        setLoadingResult(false)
      }
    }
    load()
  }, [sessionId])

  // Update detail view when question selection changes
  useEffect(() => {
    if (allResponses.length > selectedQuestionIdx) {
      const q = allResponses[selectedQuestionIdx]
      setTranscript(q.transcript || '')
      setFeedback(q.feedback || '')
      setSuggestions(q.suggestions || [])
      setMetrics(q.metrics || {})
    }
  }, [selectedQuestionIdx, allResponses])

  // Use session overall_score if available, otherwise fall back to last question's final score
  const displayScore = sessionOverallScore != null
    ? Math.round(sessionOverallScore * 100)
    : Math.round((scores.final || 0) * 100)
  const finalPct = Math.round((scores.final || 0) * 100)
  const scoreColor = displayScore >= 80 ? '#10b981' : displayScore >= 60 ? '#0ea5e9' : '#f43f5e'
  const scoreGlow = displayScore >= 80 ? 'rgba(16,185,129,0.3)' : displayScore >= 60 ? 'rgba(14,165,233,0.3)' : 'rgba(244,63,94,0.3)'

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
            {displayScore}
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}> /100</span>
          </p>
          {sessionOverallScore != null && allResponses.length > 1 && (
            <p style={{ fontSize: '0.6rem', color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', marginTop: '0.25rem' }}>
              AVG OF {allResponses.length} QUESTIONS
            </p>
          )}
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
        {/* ─── AI Performance Report ─── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          style={{
            borderRadius: '1.25rem',
            border: '1px solid rgba(148,163,184,0.25)',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* Holistic Session Summary (only if multiple questions) */}
          {sessionSummary && allResponses.length > 1 && (
            <div style={{
              background: 'rgba(14,165,233,0.04)',
              border: '1px solid rgba(14,165,233,0.15)',
              borderRadius: '0.75rem',
              padding: '1rem',
              marginBottom: '0.5rem',
            }}>
              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.55rem',
                textTransform: 'uppercase',
                color: '#0ea5e9',
                marginBottom: '0.5rem',
                fontWeight: 700,
                letterSpacing: '0.05em'
              }}>Overall Session Summary</p>
              <p style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600, lineHeight: 1.5, marginBottom: '0.4rem' }}>
                {sessionSummary.overall_verdict}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                {sessionSummary.executive_summary}
              </p>
            </div>
          )}

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.6rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#64748b',
              margin: 0,
            }}>{allResponses.length > 1 ? 'Detailed Question Report' : 'AI Performance Report'}</p>

            {/* Question Selector (Pills) */}
            {allResponses.length > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                {allResponses.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedQuestionIdx(idx)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '99px',
                      border: '1px solid',
                      borderColor: selectedQuestionIdx === idx ? '#0ea5e9' : 'rgba(148,163,184,0.3)',
                      background: selectedQuestionIdx === idx ? 'rgba(14,165,233,0.06)' : 'transparent',
                      color: selectedQuestionIdx === idx ? '#0ea5e9' : '#64748b',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    Q{idx + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Verdict badge — only shown when real verdict present */}
            {metrics.verdict && (() => {
              const v = metrics.verdict
              const isOutstanding = v.includes('Outstanding')
              const isProfessional = v.includes('Professional')
              const isDeveloping = v.includes('Developing')
              const isTechnical = v.includes('Technical')
              const isNonResponsive = v.includes('Non-Responsive')
              const bg = isOutstanding ? 'rgba(16,185,129,0.1)'
                : isProfessional ? 'rgba(14,165,233,0.1)'
                  : isDeveloping ? 'rgba(245,158,11,0.1)'
                    : 'rgba(244,63,94,0.1)'
              const clr = isOutstanding ? '#10b981'
                : isProfessional ? '#0ea5e9'
                  : isDeveloping ? '#f59e0b'
                    : '#f43f5e'
              return (
                <span style={{
                  fontSize: '0.65rem',
                  padding: '3px 10px',
                  borderRadius: 99,
                  background: bg,
                  color: clr,
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  border: `1px solid ${clr}33`,
                  whiteSpace: 'nowrap',
                }}>
                  {v}
                </span>
              )
            })()}
          </div>

          {/* Feedback text — structured as evaluator notes */}
          {feedback ? (
            <div style={{
              borderLeft: '3px solid #0ea5e9',
              paddingLeft: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}>
              {feedback.split('. ').filter(s => s.trim().length > 0).map((sentence, i) => (
                <p key={i} style={{
                  fontSize: '0.875rem',
                  lineHeight: 1.7,
                  color: '#1e293b',
                  margin: 0,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  {sentence.trim().endsWith('.') ? sentence.trim() : sentence.trim() + '.'}
                </p>
              ))}
            </div>
          ) : (
            <p style={{
              fontSize: '0.85rem',
              color: '#94a3b8',
              fontStyle: 'italic',
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}>No feedback available for this session.</p>
          )}

          {/* Metrics grid — only renders cells with real data */}
          {(() => {
            const wc = metrics.word_count
            const fillerPct = metrics.filler_word_frequency
            const fillerHits = metrics.filler_count
            const pace = metrics.speaking_rate
            const clarity = metrics.clarity_rating
            const validity = metrics.content_validity

            // Only include a metric if its value is a real, non-placeholder datum
            const cells = []

            if (wc !== undefined && wc !== null) {
              const wclr = wc >= 80 ? '#10b981' : wc >= 40 ? '#0ea5e9' : wc >= 15 ? '#f59e0b' : '#f43f5e'
              cells.push(
                <div key="wc" style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.5rem', color: '#64748b', marginBottom: '0.3rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Words</p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, color: wclr, margin: 0 }}>{wc}</p>
                  <p style={{ fontSize: '0.5rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                    {wc < 25 ? 'Too brief' : wc < 50 ? 'Concise' : wc < 100 ? 'Good depth' : 'Detailed'}
                  </p>
                </div>
              )
            }

            if (fillerHits !== undefined && fillerHits !== null && fillerPct !== undefined) {
              const fclr = fillerHits === 0 ? '#10b981' : fillerHits <= 3 ? '#f59e0b' : '#f43f5e'
              cells.push(
                <div key="filler" style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.5rem', color: '#64748b', marginBottom: '0.3rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Filler %</p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, color: fclr, margin: 0 }}>{fillerPct}</p>
                  <p style={{ fontSize: '0.5rem', color: '#94a3b8', marginTop: '0.2rem' }}>({fillerHits} hits)</p>
                </div>
              )
            }

            if (pace && pace !== 'Unknown') {
              const pclr = pace === 'Optimal' ? '#10b981' : pace === 'Moderate' ? '#0ea5e9' : '#f59e0b'
              cells.push(
                <div key="pace" style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.5rem', color: '#64748b', marginBottom: '0.3rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pace</p>
                  <p style={{ fontSize: '0.85rem', fontWeight: 800, color: pclr, margin: 0 }}>{pace}</p>
                </div>
              )
            }

            if (clarity && clarity !== 'Unknown') {
              const cclr = clarity === 'High' ? '#10b981' : clarity === 'Moderate' ? '#0ea5e9' : '#f43f5e'
              cells.push(
                <div key="clarity" style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.5rem', color: '#64748b', marginBottom: '0.3rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Clarity</p>
                  <p style={{ fontSize: '0.85rem', fontWeight: 800, color: cclr, margin: 0 }}>{clarity}</p>
                </div>
              )
            }

            if (validity && validity !== 'N/A') {
              const vclr = validity === 'Confirmed' ? '#10b981' : validity === 'Weak/Unrelated' ? '#f43f5e' : '#f59e0b'
              cells.push(
                <div key="validity" style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.5rem', color: '#64748b', marginBottom: '0.3rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Validity</p>
                  <p style={{ fontSize: '0.8rem', fontWeight: 800, color: vclr, margin: 0 }}>{validity}</p>
                </div>
              )
            }

            if (cells.length === 0) return null

            return (
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
                gap: '0.75rem',
                paddingTop: '1rem',
                borderTop: '1px solid rgba(148,163,184,0.15)',
              }}>
                {cells}
              </div>
            )
          })()}
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