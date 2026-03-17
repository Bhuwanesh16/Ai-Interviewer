import { useLocation, useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import RadarChart from '../components/RadarChart'
import { fetchResult } from '../services/api'

const ScoreMeter = ({ label, score, color, glow, delay = 0 }) => {
  const pct = score != null ? Math.round(score * 100) : null
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
        }}>
          {pct != null ? (
            <>
              {pct}<span style={{ fontSize: '0.65rem', color: '#334155', fontFamily: "'JetBrains Mono', monospace" }}>/100</span>
            </>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>N/A</span>
          )}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: 'rgba(56,189,248,0.05)', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: pct != null ? `${pct}%` : '0%' }}
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
  const [sessionSummary, setSessionSummary] = useState(null)
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState(0)

  // Averaged scores across all responses (for radar/meters)
  const [scores, setScores] = useState(
    location.state?.scores || { facial: 0, speech: 0, nlp: 0, final: 0 }
  )

  // ── FIXED: derive per-question details directly from allResponses + selectedQuestionIdx
  // instead of storing them in separate state (which caused the infinite loop via the
  // second useEffect calling setState on every render).
  const selectedResponse = allResponses[selectedQuestionIdx] ?? null

  const transcript = selectedResponse?.transcript
    ?? location.state?.transcript
    ?? ''
  const feedback = selectedResponse?.feedback
    ?? location.state?.feedback
    ?? ''
  const suggestions = selectedResponse?.suggestions
    ?? location.state?.suggestions
    ?? []
  const metrics = selectedResponse?.metrics
    ?? location.state?.metrics
    ?? {}

  // ── Multi-face integrity flag (from facial_service) ────────────────────
  // Aggregate across ALL responses: flag if ANY question had a violation.
  const integrityViolation = allResponses.some(
    r => r.metrics?.multiple_faces_detected === true
  )
  // Find the worst (highest) violation percentage across all responses
  const worstViolationPct = allResponses.reduce((max, r) => {
    const pct = r.metrics?.multiple_face_violation_pct ?? 0
    return pct > max ? pct : max
  }, 0)
  const peakFaceCount = allResponses.reduce((max, r) => {
    const n = r.metrics?.face_count_max ?? 0
    return n > max ? n : max
  }, 0)

  const SENTINEL = '__EMPTY_AUDIO__'

  const isTranscriptUnavailable =
    !transcript ||
    transcript === SENTINEL ||
    (
      typeof transcript === 'string' &&
      transcript.toLowerCase().includes('transcription unavailable')
    )

  // Single useEffect — only loads data once when sessionId changes
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false

    const load = async () => {
      try {
        setLoadingResult(true)
        setFetchError(false)
        const { data } = await fetchResult(sessionId)
        if (cancelled) return

        const responses = data.responses || []
        setAllResponses(responses)
        setSessionPosition(data.position || '')
        setSessionSummary(data.session_summary || null)

        if (data.overall_score != null) {
          setSessionOverallScore(data.overall_score)
        }

        if (responses.length > 0) {
          const avg = (key) => {
            const vals = responses.map(r => r[key]).filter(v => v != null)
            if (vals.length === 0) return null
            return vals.reduce((a, b) => a + b, 0) / vals.length
          }
          setScores({
            facial: avg('facial_score'),
            speech: avg('speech_score'),
            nlp: avg('nlp_score'),
            final: data.overall_score != null ? data.overall_score : avg('final_score') || 0,
          })
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load result', err)
          setFetchError(true)
        }
      } finally {
        if (!cancelled) setLoadingResult(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [sessionId]) // ← only sessionId; no derived state deps that could loop

  const displayScore = sessionOverallScore != null
    ? Math.round(sessionOverallScore * 100)
    : Math.round((scores.final || 0) * 100)
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

  if (fetchError) {
    return (
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '4rem 1.5rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', gap: '1rem',
      }}>
        <p style={{ fontSize: '1rem', color: '#f43f5e', fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>
          Could not load results
        </p>
        <p style={{ fontSize: '0.875rem', color: '#64748b', fontFamily: "'DM Sans', sans-serif", textAlign: 'center', maxWidth: 400 }}>
          The backend returned a CORS or network error. Make sure your Flask server is running and
          has <code>CORS(app)</code> configured with <code>supports_credentials=True</code> and your
          frontend origin allowed.
        </p>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '0.6rem 1.25rem', borderRadius: '99px',
            background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
            color: '#fff', border: 'none', cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '0.875rem',
          }}
        >
          ← Back to home
        </button>
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
              AVERAGE OF {allResponses.length} QUESTIONS
            </p>
          )}
        </motion.div>
      </motion.div>

      {/* ── Integrity Warning Banner (shown when multiple faces detected) ── */}
      {integrityViolation && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{
            borderRadius: '1rem',
            border: '1.5px solid rgba(244,63,94,0.5)',
            background: 'linear-gradient(135deg, rgba(244,63,94,0.06), rgba(251,113,133,0.04))',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.875rem',
            boxShadow: '0 2px 16px rgba(244,63,94,0.1)',
          }}
        >
          {/* Icon */}
          <div style={{
            width: 36, height: 36, flexShrink: 0,
            borderRadius: '50%',
            background: 'rgba(244,63,94,0.12)',
            border: '1px solid rgba(244,63,94,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem',
          }}>
            ⚠️
          </div>
          <div style={{ flex: 1 }}>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.65rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#f43f5e',
              fontWeight: 700,
              marginBottom: '0.3rem',
            }}>Integrity Alert — Multiple Faces Detected</p>
            <p style={{
              fontSize: '0.8375rem',
              color: '#1e293b',
              lineHeight: 1.6,
              margin: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Our facial analysis detected <strong>{peakFaceCount} {peakFaceCount === 2 ? 'faces' : 'or more faces'}</strong> in&nbsp;
              <strong style={{ color: '#f43f5e' }}>{worstViolationPct}%</strong> of frames during this session.
              This may indicate an unauthorized third party was present. The facial score has been penalized accordingly.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Score cards + Radar ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <ScoreMeter label="Emotion signal" score={scores.facial} color="#10b981" glow="rgba(16,185,129,0.4)" delay={0.1} />
          <ScoreMeter label="Speech clarity" score={scores.speech} color="#0ea5e9" glow="rgba(14,165,233,0.4)" delay={0.2} />
          <ScoreMeter label="Content relevance" score={isTranscriptUnavailable ? null : scores.nlp} color="#8b5cf6" glow="rgba(139,92,246,0.4)" delay={0.3} />

          {isTranscriptUnavailable && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4 }}
              style={{
                borderRadius: '1rem',
                border: '1px solid rgba(148,163,184,0.2)',
                background: 'rgba(148,163,184,0.05)',
                padding: '0.9rem 1rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.6rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#64748b',
                marginBottom: '0.4rem',
                fontWeight: 700,
              }}>
                Audio transcript unavailable
              </p>
              <p style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                No speech was detected in this recording. Content scoring has been skipped.
                Ensure your microphone is enabled and speak clearly during the interview.
              </p>
            </motion.div>
          )}
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
          {/* Holistic Session Summary */}
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

          {/* Header + Question Selector */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.6rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#64748b',
              margin: 0,
            }}>{allResponses.length > 1 ? 'Detailed Question Report' : 'AI Performance Report'}</p>

            {allResponses.length > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
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

            {metrics.verdict && (() => {
              const v = metrics.verdict
              const isOutstanding = v.includes('Outstanding')
              const isProfessional = v.includes('Professional')
              const isDeveloping = v.includes('Developing')
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

          {/* Feedback */}
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

          {/* Metrics grid */}
          {(() => {
            const wc = metrics.word_count
            const pace = metrics.speaking_rate
            const clarity = metrics.clarity_rating
            const validity = metrics.content_validity
            const ec = metrics.eye_contact
            const conf = metrics.confidence_level

            const cells = []

            if (wc !== undefined && wc !== null) {
              const wclr = wc >= 80 ? '#10b981' : wc >= 40 ? '#0ea5e9' : wc >= 15 ? '#f59e0b' : '#f43f5e'
              cells.push(
                <div key="wc" style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.5rem', color: '#64748b', marginBottom: '0.3rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Words</p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, color: wclr, margin: 0 }}>{wc}</p>
                </div>
              )
            }
            if (ec && ec !== 'N/A') {
              const eclr = ec === 'High' ? '#10b981' : ec === 'Good' ? '#0ea5e9' : '#f59e0b'
              cells.push(
                <div key="ec" style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.5rem', color: '#64748b', marginBottom: '0.3rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Eye Contact</p>
                  <p style={{ fontSize: '0.85rem', fontWeight: 800, color: eclr, margin: 0 }}>{ec}</p>
                </div>
              )
            }
            if (conf && conf !== 'N/A') {
              const cclr = conf === 'Confident' ? '#10b981' : conf === 'Steady' ? '#0ea5e9' : '#f59e0b'
              cells.push(
                <div key="conf" style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.5rem', color: '#64748b', marginBottom: '0.3rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Confidence</p>
                  <p style={{ fontSize: '0.85rem', fontWeight: 800, color: cclr, margin: 0 }}>{conf}</p>
                </div>
              )
            }
            if (pace && pace !== 'Unknown') {
              const pclr = pace === 'Optimal' || pace === 'Fluid' ? '#10b981' : pace === 'Moderate' ? '#0ea5e9' : '#f59e0b'
              cells.push(
                <div key="pace" style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.5rem', color: '#64748b', marginBottom: '0.3rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pace</p>
                  <p style={{ fontSize: '0.85rem', fontWeight: 800, color: pclr, margin: 0 }}>{pace}</p>
                </div>
              )
            }
            if (clarity && clarity !== 'Unknown') {
              const cclr = clarity === 'High' || clarity === 'Excellent' ? '#10b981' : clarity === 'Moderate' || clarity === 'Professional' ? '#0ea5e9' : '#f43f5e'
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
                  <p style={{ fontSize: '0.85rem', fontWeight: 800, color: vclr, margin: 0 }}>{validity}</p>
                </div>
              )
            }

            if (cells.length === 0) return null
            return (
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fit, minmax(80px, 1fr))`,
                gap: '1rem',
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
            {suggestions.length > 0 ? suggestions.map((tip, i) => (
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
                  <span style={{ fontSize: '0.55rem', fontFamily: "'JetBrains Mono', monospace", color: '#0ea5e9' }}>{i + 1}</span>
                </div>
                <p style={{ fontSize: '0.8375rem', color: '#475569', lineHeight: 1.65, fontFamily: "'DM Sans', sans-serif" }}>
                  {tip}
                </p>
              </motion.div>
            )) : (
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic', fontFamily: "'DM Sans', sans-serif" }}>
                No suggestions available.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 1rem', borderRadius: '99px',
                border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(255,255,255,0.9)',
                color: '#64748b', fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.2s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.4)'; e.currentTarget.style.color = '#0ea5e9'; e.currentTarget.style.background = 'rgba(14,165,233,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(148,163,184,0.3)'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'rgba(255,255,255,0.9)' }}
            >
              ← Back to home
            </button>
            <button
              onClick={() => window.print()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 1rem', borderRadius: '99px',
                border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(255,255,255,0.9)',
                color: '#64748b', fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.2s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(14,165,233,0.4)'; e.currentTarget.style.color = '#0ea5e9'; e.currentTarget.style.background = 'rgba(14,165,233,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(148,163,184,0.3)'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'rgba(255,255,255,0.9)' }}
            >
              ↓ Download report
            </button>
            <button
              onClick={() => navigate('/interview')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.5rem 1rem', borderRadius: '99px',
                border: 'none', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                color: '#fff', fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 2px 12px rgba(14,165,233,0.35)', transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(14,165,233,0.45)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(14,165,233,0.35)'; e.currentTarget.style.transform = 'translateY(0)' }}
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
        }}>{isTranscriptUnavailable
          ? 'No speech was detected in this recording. Please ensure your microphone is enabled and you speak clearly.'
          : (transcript || 'No transcript available.')}
        </p>
      </motion.div>
    </div>
  )
}

export default Result