import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import InterviewCard from '../components/InterviewCard'
import WebcamRecorder from '../components/WebcamRecorder'
import AudioWave from '../components/AudioWave'
import RealTimeFeedback from '../components/RealTimeFeedback'
import LoadingScreen from '../components/LoadingScreen'
import { startInterview, submitInterview, generateQuestions } from '../services/api'

const DEFAULT_QUESTION = 'Tell me about a time you solved a challenging technical problem.'

const LEVEL_COLORS = {
  'Entry Level': { bg: 'rgba(16,185,129,0.1)', text: '#10b981', label: 'Entry' },
  'Intermediate': { bg: 'rgba(14,165,233,0.1)', text: '#0ea5e9', label: 'Mid' },
  'Senior': { bg: 'rgba(139,92,246,0.1)', text: '#8b5cf6', label: 'Senior' },
  'Lead / Manager': { bg: 'rgba(249,115,22,0.1)', text: '#f97316', label: 'Lead' },
}

const Interview = () => {
  const navigate = useNavigate()
  const [sessionId, setSessionId] = useState(null)

  // Setup flow
  const [isSetupComplete, setIsSetupComplete] = useState(false)
  const [role, setRole] = useState('Software Engineer')
  const [skills, setSkills] = useState('')
  const [level, setLevel] = useState('Intermediate')
  const [numQuestions, setNumQuestions] = useState(3)
  const [questions, setQuestions] = useState([DEFAULT_QUESTION])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [questionSource, setQuestionSource] = useState(null) // 'llm' | 'fallback'

  const question = questions[currentQuestionIndex]
  const [timer, setTimer] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [mediaStream, setMediaStream] = useState(null)
  const [currentEmotionScore, setCurrentEmotionScore] = useState(0)
  const [currentSpeechScore, setCurrentSpeechScore] = useState(0)
  const emotionScoresRef = useRef([])
  const speechScoresRef = useRef([])
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | recording | processing

  useEffect(() => {
    let interval
    if (isRecording) {
      interval = setInterval(() => setTimer(t => t + 1), 1000)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  // Auto-generate questions when role, level, skills, or numQuestions change
  const [debouncedSkills, setDebouncedSkills] = useState(skills)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSkills(skills), 500)
    return () => clearTimeout(t)
  }, [skills])

  useEffect(() => {
    if (isSetupComplete) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const { data } = await generateQuestions({ role, skills: debouncedSkills, level, numQuestions })
        if (!cancelled && data?.questions?.length > 0) {
          const cleaned = data.questions.filter(
            (q) => typeof q === 'string' && q.trim().length > 10
          )
          setQuestions(cleaned.length > 0 ? cleaned.slice(0, numQuestions) : [DEFAULT_QUESTION])
          setCurrentQuestionIndex(0)
          setQuestionSource(data.source || 'llm')
        }
      } catch {
        if (!cancelled) setQuestionSource('fallback')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (role && level) run()
    return () => { cancelled = true }
  }, [role, level, debouncedSkills, numQuestions])

  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const ensureSession = async () => {
    if (sessionId) return sessionId
    const { data } = await startInterview({ position: role, experience_level: level })
    setSessionId(data.session_id)
    return data.session_id
  }

  const handleStart = async () => {
    try {
      await ensureSession()
      if (!mediaStream) return
      const recorder = new MediaRecorder(mediaStream)
      chunksRef.current = []
      emotionScoresRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        setLoading(true)
        setPhase('processing')
        try {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' })
          const session = await ensureSession()

          const avgEmotionScore = emotionScoresRef.current.length > 0
            ? emotionScoresRef.current.reduce((a, b) => a + b, 0) / emotionScoresRef.current.length
            : 0

          const avgSpeechScore = speechScoresRef.current.length > 0
            ? speechScoresRef.current.reduce((a, b) => a + b, 0) / speechScoresRef.current.length
            : 0

          const formData = new FormData()
          formData.append('session_id', session)
          formData.append('question', question)
          formData.append('video', blob, 'response.webm')
          formData.append('audio', blob, 'response.webm')
          formData.append('edge_facial_score', avgEmotionScore.toString())
          formData.append('edge_speech_score', avgSpeechScore.toString())
          const { data } = await submitInterview(formData)

          if (currentQuestionIndex < questions.length - 1) {
            // Automatic move to next question
            setCurrentQuestionIndex(prev => prev + 1)
            setLoading(false)
            setPhase('idle')
          } else {
            // Final question - go to results
            navigate(`/result/${data.session_id}`, {
              state: {
                scores: data.scores,
                transcript: data.transcript,
                feedback: data.feedback,
                suggestions: data.suggestions,
                metrics: data.metrics
              },
            })
          }
        } catch (err) {
          console.error(err)
          setLoading(false)
          setPhase('idle')
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setTimer(0)
      setIsRecording(true)
      setPhase('recording')
    } catch (err) {
      console.error(err)
    }
  }

  const handleStop = () => {
    if (mediaRecorderRef.current && isRecording) {
      setIsRecording(false)
      setPhase('idle')
      mediaRecorderRef.current.stop()
    }
  }

  const handleSetupSubmit = async (e) => {
    e.preventDefault()
    if (questions.length === 0 || questions[0] === DEFAULT_QUESTION) {
      setLoading(true)
      try {
        const { data } = await generateQuestions({ role, skills, level, numQuestions })
        if (data?.questions?.length > 0) {
          const cleaned = data.questions.filter(
            (q) => typeof q === 'string' && q.trim().length > 10
          )
          setQuestions(cleaned.length > 0 ? cleaned.slice(0, numQuestions) : [DEFAULT_QUESTION])
          setCurrentQuestionIndex(0)
          setQuestionSource(data.source || 'llm')
        }
      } catch (err) {
        console.error(err)
        setQuestionSource('fallback')
      } finally {
        setLoading(false)
      }
    }
    setIsSetupComplete(true)
  }

  const handleRegenerate = async () => {
    if (isRecording) return
    setLoading(true)
    try {
      const { data } = await generateQuestions({ role, skills, level, numQuestions })
      if (data.questions && data.questions.length > 0) {
        const cleaned = data.questions.filter(
          (q) => typeof q === 'string' && q.trim().length > 10
        )
        setQuestions(cleaned.length > 0 ? cleaned.slice(0, numQuestions) : [DEFAULT_QUESTION])
        setCurrentQuestionIndex(0)
        setSessionId(null) // reset session so a fresh one starts
        setQuestionSource(data.source || 'llm')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const ROLES = [
    'Software Engineer',
    'Frontend Developer',
    'Backend Developer',
    'Full Stack Developer',
    'Data Scientist',
    'Machine Learning Engineer',
    'DevOps Engineer',
    'Product Manager',
    'UI/UX Designer',
    'QA Engineer',
    'Cyber Security Analyst'
  ]

  if (!isSetupComplete) {
    return (
      <div style={{
        maxWidth: 650,
        margin: '4rem auto',
        padding: '3rem',
        borderRadius: '1.75rem',
        background: 'rgba(255, 255, 255, 0.98)',
        border: '1px solid rgba(148,163,184,0.25)',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: '2.25rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: '#0ea5e9',
            marginBottom: '0.75rem'
          }}>
            Interview Configuration
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem', fontWeight: 450 }}>
            Configure your session parameters to begin industrial-grade AI assessment.
          </p>
        </div>

        <form onSubmit={handleSetupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#0ea5e9', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Target Professional Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.875rem 1.125rem',
                borderRadius: '0.875rem',
                border: '1px solid #cbd5e1',
                outline: 'none',
                fontSize: '1rem',
                color: '#1e293b',
                background: '#fff',
                cursor: 'pointer',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
              }}
              onFocus={e => {
                e.target.style.borderColor = '#0ea5e9'
                e.target.style.boxShadow = '0 0 0 4px rgba(14, 165, 233, 0.15)'
              }}
              onBlur={e => {
                e.target.style.borderColor = '#cbd5e1'
                e.target.style.boxShadow = 'none'
              }}
            >
              <option value="" disabled>Select a role...</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#0ea5e9', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Core Competencies</label>
            <input
              value={skills}
              onChange={e => setSkills(e.target.value)}
              placeholder="e.g. React, Distributed Systems, Python (optional)"
              style={{
                width: '100%',
                padding: '0.875rem 1.125rem',
                borderRadius: '0.875rem',
                border: '1px solid #cbd5e1',
                outline: 'none',
                fontSize: '1rem',
                color: '#1e293b'
              }}
              onFocus={e => {
                e.target.style.borderColor = '#0ea5e9'
                e.target.style.boxShadow = '0 0 0 4px rgba(14, 165, 233, 0.15)'
              }}
              onBlur={e => {
                e.target.style.borderColor = '#cbd5e1'
                e.target.style.boxShadow = 'none'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#0ea5e9', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Experience Tier</label>
              <select
                value={level}
                onChange={e => setLevel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.875rem 1.125rem',
                  borderRadius: '0.875rem',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  fontSize: '1rem',
                  color: '#1e293b',
                  background: '#fff',
                  cursor: 'pointer'
                }}
              >
                <option>Entry Level</option>
                <option>Intermediate</option>
                <option>Senior</option>
                <option>Lead / Manager</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#0ea5e9', marginBottom: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Question Volume</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="number"
                  min="1"
                  value={numQuestions}
                  onChange={e => setNumQuestions(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '0.875rem 1.125rem',
                    borderRadius: '0.875rem',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    fontSize: '1rem',
                    color: '#1e293b'
                  }}
                />
                <span style={{ position: 'absolute', right: '1rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Standard Set</span>
              </div>
            </div>
          </div>

          {/* AI Generation Notice */}
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
            background: 'rgba(14,165,233,0.06)',
            border: '1px solid rgba(14,165,233,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem'
          }}>
            <span style={{ fontSize: '1rem' }}>🤖</span>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#475569', lineHeight: 1.5 }}>
              Questions are <b style={{ color: '#0ea5e9' }}>generated automatically</b> from your role, skills, and experience level.
              A local LLaMA3 model tailors them; if the AI service is offline, a curated bank is used.
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.01, translateY: -2 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            style={{
              padding: '1.125rem',
              borderRadius: '0.875rem',
              border: 'none',
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1.125rem',
              cursor: 'pointer',
              marginTop: '0.5rem',
              boxShadow: '0 10px 15px -3px rgba(14, 165, 233, 0.3), 0 4px 6px -2px rgba(14, 165, 233, 0.05)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem'
            }}
          >
            {loading ? (
              <>
                <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                <span>Generating AI Questions...</span>
              </>
            ) : (
              <span>✦ Generate & Start Interview</span>
            )}
          </motion.button>
        </form>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <AnimatePresence>{loading && <LoadingScreen />}</AnimatePresence>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '2rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.62rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#0ea5e9',
              marginBottom: '0.35rem',
            }}>Mock session · {role}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 800,
                fontSize: 'clamp(1.5rem, 4vw, 2rem)',
                letterSpacing: '-0.04em',
                color: '#0f172a',
                margin: 0,
              }}>Interview Room</h1>

              {/* Difficulty chip */}
              {(() => {
                const lc = LEVEL_COLORS[level] || LEVEL_COLORS['Intermediate']
                return (
                  <span style={{
                    padding: '0.2rem 0.65rem',
                    borderRadius: '99px',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    background: lc.bg,
                    color: lc.text,
                    border: `1px solid ${lc.text}33`,
                    letterSpacing: '0.05em',
                  }}>{lc.label}</span>
                )
              })()}

              {/* AI / Fallback source badge */}
              <span style={{
                padding: '0.2rem 0.65rem',
                borderRadius: '99px',
                fontSize: '0.62rem',
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                background: questionSource === 'llm' ? 'rgba(139,92,246,0.1)' : 'rgba(148,163,184,0.1)',
                color: questionSource === 'llm' ? '#8b5cf6' : '#64748b',
                border: questionSource === 'llm' ? '1px solid rgba(139,92,246,0.25)' : '1px solid rgba(148,163,184,0.2)',
                boxShadow: questionSource === 'llm' ? '0 0 8px rgba(139,92,246,0.15)' : 'none',
                letterSpacing: '0.04em',
              }}>{questionSource === 'llm' ? '✦ AI' : '📋 Static'}</span>
            </div>
          </div>

          {/* Right side: Regenerate + Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Regenerate button */}
            {!isRecording && (
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleRegenerate}
                disabled={loading}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '99px',
                  border: '1px solid rgba(139,92,246,0.35)',
                  background: 'rgba(139,92,246,0.06)',
                  color: '#8b5cf6',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.2s ease',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {loading ? '⟳ Generating...' : '⟳ Regenerate Questions'}
              </motion.button>
            )}

            {/* Status indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.625rem',
              padding: '0.5rem 1rem',
              borderRadius: '99px',
              border: `1px solid ${isRecording ? 'rgba(225,29,72,0.35)' : 'rgba(148,163,184,0.25)'}`,
              background: isRecording ? 'rgba(225,29,72,0.06)' : 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.3s ease',
            }}>
              <div style={{
                width: 7, height: 7,
                borderRadius: '50%',
                background: isRecording ? '#e11d48' : '#94a3b8',
                boxShadow: isRecording ? '0 0 8px rgba(225,29,72,0.5)' : 'none',
                animation: isRecording ? 'recordPulse 1.1s ease-in-out infinite' : 'none',
              }} />
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                color: isRecording ? '#e11d48' : '#64748b',
                transition: 'color 0.3s ease',
              }}>
                {isRecording ? `REC ${fmtTime(timer)}` : phase === 'processing' ? 'PROCESSING' : 'STANDBY'}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.25rem',
        alignItems: 'start',
      }}>
        {/* Left: Question card */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <InterviewCard
            question={question}
            onStart={handleStart}
            onStop={handleStop}
            isRecording={isRecording}
            timer={timer}
            onNextQuestion={!isRecording && currentQuestionIndex < questions.length - 1 ? () => setCurrentQuestionIndex(i => i + 1) : null}
            onPrevQuestion={!isRecording && currentQuestionIndex > 0 ? () => setCurrentQuestionIndex(i => i - 1) : null}
            currentIdx={currentQuestionIndex}
            totalQuestions={questions.length}
          />
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: '1.25rem' }}
            >
              <RealTimeFeedback scores={{ facial: currentEmotionScore, speech: currentSpeechScore }} />
            </motion.div>
          )}
        </motion.div>

        {/* Right: Camera + Audio */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <WebcamRecorder
            isRecording={isRecording}
            mediaStream={mediaStream}
            setMediaStream={setMediaStream}
            onEmotionScore={(score) => {
              setCurrentEmotionScore(score)
              if (isRecording) {
                emotionScoresRef.current.push(score)
              }
            }}
          />
          <AudioWave
            mediaStream={mediaStream}
            isRecording={isRecording}
            onSpeechScore={(score) => {
              setCurrentSpeechScore(score)
              if (isRecording) {
                speechScoresRef.current.push(score)
              }
            }}
          />
        </motion.div>
      </div>

      {/* Tips strip */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        style={{
          marginTop: '1.5rem',
          padding: '0.875rem 1.25rem',
          borderRadius: '1rem',
          border: '1px solid rgba(148,163,184,0.2)',
          background: 'rgba(255,255,255,0.85)',
          display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        {['Speak clearly at a measured pace', 'Maintain eye contact with the camera', 'Structure answers: Situation → Action → Result'].map((tip, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#0ea5e9', flexShrink: 0 }} />
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: "'DM Sans', sans-serif" }}>{tip}</span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

export default Interview