import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import InterviewCard from '../components/InterviewCard'
import WebcamRecorder from '../components/WebcamRecorder'
import AudioWave from '../components/AudioWave'
import RealTimeFeedback from '../components/RealTimeFeedback'
import LoadingScreen from '../components/LoadingScreen'
import StatusPill from '../components/StatusPill'
import { startInterview, submitInterview, generateQuestions } from '../services/api'

const DEFAULT_QUESTION = 'Tell me about a time you solved a challenging technical problem.'

const LEVEL_COLORS = {
  'Entry Level':    { bg: 'rgba(16,185,129,0.1)',  text: '#10b981', label: 'Entry' },
  'Intermediate':   { bg: 'rgba(14,165,233,0.1)',  text: '#0ea5e9', label: 'Mid' },
  'Senior':         { bg: 'rgba(139,92,246,0.1)',  text: '#8b5cf6', label: 'Senior' },
  'Lead / Manager': { bg: 'rgba(249,115,22,0.1)',  text: '#f97316', label: 'Lead' },
}

const INITIAL_LIVE = { score: 0, eyeContact: 'Low', posture: 'Unknown', smile: 0, presence: '0%', speech: 0 }

// Generation progress steps shown to user during phi3 inference
// Timings are conservative — phi3 on CPU takes 20–60s depending on hardware
const GEN_STEPS = [
  [500,   'Connecting to AI model...'],
  [3000,  'Analysing role requirements...'],
  [10000, 'Generating questions...'],
  [25000, 'Refining question set...'],
  [45000, 'Almost ready...'],
]

const Interview = () => {
  const navigate = useNavigate()
  const [sessionId, setSessionId]         = useState(null)
  const [setupStep, setSetupStep]         = useState(1)
  const [customRole, setCustomRole]       = useState('')
  const [useCustomRole, setUseCustomRole] = useState(false)

  const [backendOk, setBackendOk]     = useState(null)
  const [avOk, setAvOk]               = useState({ camera: null, mic: null })
  const [faceModelOk, setFaceModelOk] = useState(null)

  const [isSetupComplete, setIsSetupComplete] = useState(false)
  const [role, setRole]             = useState('Software Engineer')
  const [skills, setSkills]         = useState('')
  const [level, setLevel]           = useState('Intermediate')
  const [numQuestions, setNumQuestions] = useState(3)
  const [questions, setQuestions]   = useState([DEFAULT_QUESTION])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [questionSource, setQuestionSource] = useState(null)

  const question = questions[currentQuestionIndex]
  const [timer, setTimer]         = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [mediaStream, setMediaStream] = useState(null)

  const [liveData, setLiveData]   = useState(INITIAL_LIVE)

  // ── Generation progress state ─────────────────────────────────────────────
  const [genStatus, setGenStatus] = useState('')
  const genTimersRef = useRef([])

  const emotionScoresRef = useRef([])
  const speechScoresRef  = useRef([])
  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const [loading, setLoading] = useState(false)
  const [phase, setPhase]     = useState('idle')

  const onEmotionScoreRef = useRef(null)
  const onSpeechScoreRef  = useRef(null)
  const isRecordingRef    = useRef(isRecording)

  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])

  const handleEmotionScore = useCallback((data) => {
    setLiveData(prev => ({ ...prev, ...data }))
    if (isRecordingRef.current) emotionScoresRef.current.push(data.score)
  }, [])

  const handleSpeechScore = useCallback((score) => {
    setLiveData(prev => ({ ...prev, speech: score }))
    if (isRecordingRef.current) speechScoresRef.current.push(score)
  }, [])

  useEffect(() => {
    let interval
    if (isRecording) interval = setInterval(() => setTimer(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [isRecording])

  // ── FIX: health poll interval 5s → 30s ───────────────────────────────────
  // Was firing every 5s = 12 requests/min, spamming logs and wasting CPU.
  // 30s is sufficient to detect backend going offline in a reasonable time.
  useEffect(() => {
    let cancelled = false
    const ping = async () => {
      try {
        const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '')
        const res = await fetch(`${base}/health`)
        if (!cancelled) setBackendOk(res.ok)
      } catch {
        if (!cancelled) setBackendOk(false)
      }
    }
    ping()                                    // immediate check on mount
    const t = setInterval(ping, 30_000)       // FIX: was 5_000 (5s) → 30_000 (30s)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  // Camera/mic probe — runs once only, no polling needed
  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          if (!cancelled) setAvOk({ camera: false, mic: false }); return
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        const videoTrack = stream.getVideoTracks()[0]
        const audioTrack = stream.getAudioTracks()[0]
        if (!cancelled) setAvOk({ camera: !!videoTrack, mic: !!audioTrack })
        stream.getTracks().forEach(t => t.stop())
      } catch {
        if (!cancelled) setAvOk({ camera: false, mic: false })
      }
    }
    probe()
    return () => { cancelled = true }
  }, [])

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
      speechScoresRef.current  = []

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }

      recorder.onstop = async () => {
        setLoading(true)
        setPhase('processing')
        try {
          const blob    = new Blob(chunksRef.current, { type: 'video/webm' })
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
          formData.append('question_index', currentQuestionIndex)
          formData.append('video', blob, 'response.webm')
          formData.append('audio', blob, 'response.webm')
          formData.append('edge_facial_score', avgEmotionScore.toString())
          formData.append('edge_speech_score', avgSpeechScore.toString())

          const { data } = await submitInterview(formData)

          if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1)
            setLiveData(INITIAL_LIVE)
            setLoading(false)
            setPhase('idle')
          } else {
            navigate(`/result/${data.session_id}`, {
              state: {
                scores:      data.scores,
                transcript:  data.transcript,
                feedback:    data.feedback,
                suggestions: data.suggestions,
                metrics:     data.metrics,
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

  const effectiveRole = useCustomRole ? customRole : role

  // ── FIX: handleSetupSubmit with progress bar ──────────────────────────────
  const handleSetupSubmit = async (e) => {
    e.preventDefault()
    if (useCustomRole && !customRole.trim()) return

    setLoading(true)
    setGenStatus('Starting AI model...')

    // Clear any stale timers from a previous attempt
    genTimersRef.current.forEach(clearTimeout)
    genTimersRef.current = GEN_STEPS.map(([ms, msg]) =>
      setTimeout(() => setGenStatus(msg), ms)
    )

    try {
      const { data } = await generateQuestions({ role: effectiveRole, skills, level, numQuestions })

      // Clear progress timers — response arrived
      genTimersRef.current.forEach(clearTimeout)
      setGenStatus('Questions ready ✓')

      if (data?.questions?.length > 0) {
        const cleaned = data.questions.filter(q => typeof q === 'string' && q.trim().length > 10)
        setQuestions(cleaned.length > 0 ? cleaned.slice(0, numQuestions) : [DEFAULT_QUESTION])
        setQuestionSource(data.source || 'llm')
      } else {
        setQuestions([DEFAULT_QUESTION])
        setQuestionSource(data?.source || 'fallback')
      }

      // Brief pause so user sees "ready" before advancing
      setTimeout(() => {
        setGenStatus('')
        setSetupStep(2)
        setLoading(false)
      }, 600)

    } catch (err) {
      console.error(err)
      genTimersRef.current.forEach(clearTimeout)
      setGenStatus('')
      setQuestions([DEFAULT_QUESTION])
      setQuestionSource('fallback')
      setSetupStep(2)
      setLoading(false)
    }
  }

  const handleStartInterview  = () => setIsSetupComplete(true)
  const handleBackToConfig    = () => setSetupStep(1)
  const handleResetSetup      = () => {
    if (isRecording) return
    setIsSetupComplete(false)
    setSetupStep(1)
    setSessionId(null)
    setCurrentQuestionIndex(0)
    setLiveData(INITIAL_LIVE)
  }

  const ROLES = [
    'Software Engineer', 'Frontend Developer', 'Backend Developer',
    'Full Stack Developer', 'Data Scientist', 'Machine Learning Engineer',
    'DevOps Engineer', 'Product Manager', 'UI/UX Designer',
    'QA Engineer', 'Cyber Security Analyst', 'Other (Custom)',
  ]

  // ── Setup UI ────────────────────────────────────────────────────────────────
  if (!isSetupComplete) {
    return (
      <div style={{
        maxWidth: 700, margin: '4rem auto', padding: '3rem',
        borderRadius: '2rem', background: 'rgba(255,255,255,0.98)',
        border: '1px solid rgba(148,163,184,0.25)',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)',
        backdropFilter: 'blur(10px)', position: 'relative', overflow: 'hidden',
      }}>
        {/* Step progress bar */}
        <div style={{ display: 'flex', gap: '4px', position: 'absolute', top: 0, left: 0, right: 0, height: '4px' }}>
          <div style={{ flex: 1, background: setupStep >= 1 ? '#0ea5e9' : '#e2e8f0', transition: 'background 0.3s' }} />
          <div style={{ flex: 1, background: setupStep >= 2 ? '#0ea5e9' : '#e2e8f0', transition: 'background 0.3s' }} />
        </div>

        <AnimatePresence mode="wait">
          {setupStep === 1 ? (
            <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>
              <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', marginBottom: '0.75rem' }}>
                  Interview AI
                </h2>
                <p style={{ color: '#64748b', fontSize: '1rem' }}>Step 1: Configure your professional session</p>
              </div>

              <form onSubmit={handleSetupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                  {/* Role */}
                  <div>
                    <label style={labelStyle}>Target Role</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <select
                        value={useCustomRole ? 'Other (Custom)' : role}
                        onChange={e => {
                          if (e.target.value === 'Other (Custom)') { setUseCustomRole(true) }
                          else { setUseCustomRole(false); setRole(e.target.value) }
                        }}
                        style={selectStyle}
                      >
                        <option value="" disabled>Select a role...</option>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      {useCustomRole && (
                        <motion.input
                          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                          value={customRole} onChange={e => setCustomRole(e.target.value)}
                          placeholder="Enter your specific role title..." autoFocus
                          style={{ ...inputStyle, border: '1px solid #0ea5e9', boxShadow: '0 0 0 4px rgba(14,165,233,0.1)' }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Skills */}
                  <div>
                    <label style={labelStyle}>Key Skills / Tech Stack</label>
                    <input
                      value={skills} onChange={e => setSkills(e.target.value)}
                      placeholder="e.g. React, Python, Cloud Architecture (comma separated)"
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    {/* Level */}
                    <div>
                      <label style={labelStyle}>Experience Level</label>
                      <select value={level} onChange={e => setLevel(e.target.value)} style={selectStyle}>
                        <option>Entry Level</option>
                        <option>Intermediate</option>
                        <option>Senior</option>
                        <option>Lead / Manager</option>
                      </select>
                    </div>

                    {/* Question count */}
                    <div>
                      <label style={labelStyle}>Num Questions: {numQuestions}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>1</span>
                        <input type="range" min="1" max="10" step="1" value={numQuestions}
                          onChange={e => setNumQuestions(parseInt(e.target.value))}
                          style={{ flex: 1, accentColor: '#0ea5e9', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>10</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Generation progress indicator ── */}
                <AnimatePresence>
                  {loading && genStatus && (
                    <motion.div
                      key="gen-status"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '0.875rem',
                        background: genStatus.includes('✓')
                          ? 'rgba(16,185,129,0.08)'
                          : 'rgba(14,165,233,0.08)',
                        border: `1px solid ${genStatus.includes('✓')
                          ? 'rgba(16,185,129,0.25)'
                          : 'rgba(14,165,233,0.2)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      {/* Spinner or checkmark */}
                      {genStatus.includes('✓') ? (
                        <span style={{ fontSize: '1rem' }}>✓</span>
                      ) : (
                        <div style={{
                          width: 14, height: 14, flexShrink: 0,
                          borderRadius: '50%',
                          border: '2px solid rgba(14,165,233,0.2)',
                          borderTopColor: '#0ea5e9',
                          animation: 'spin 0.8s linear infinite',
                        }} />
                      )}
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.75rem',
                        color: genStatus.includes('✓') ? '#10b981' : '#0ea5e9',
                        letterSpacing: '0.02em',
                      }}>
                        {genStatus}
                      </span>
                      {/* Animated dots for in-progress states */}
                      {!genStatus.includes('✓') && (
                        <span style={{
                          marginLeft: 'auto',
                          fontSize: '0.7rem',
                          color: '#94a3b8',
                          fontFamily: "'DM Sans', sans-serif",
                        }}>
                          phi3 · CPU inference
                        </span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button whileHover={{ scale: loading ? 1 : 1.02 }} whileTap={{ scale: loading ? 1 : 0.98 }}
                  type="submit" disabled={loading}
                  style={{
                    padding: '1.25rem', borderRadius: '1rem',
                    background: loading
                      ? 'rgba(14,165,233,0.4)'
                      : 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                    color: loading ? '#94a3b8' : '#fff',
                    fontWeight: 800, fontSize: '1.125rem', border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: loading ? 'none' : '0 10px 25px -5px rgba(14,165,233,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
                    transition: 'all 0.25s ease',
                  }}>
                  {loading
                    ? <span style={{ opacity: 0.7 }}>Generating...</span>
                    : <><span>Generate My Questions</span><span>→</span></>
                  }
                </motion.button>
              </form>
            </motion.div>
          ) : (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>Curated Set Ready</h2>
                <p style={{ color: '#64748b' }}>Review your AI-generated questions before entering the room</p>
              </div>

              <div style={{ background: '#f8fafc', borderRadius: '1.5rem', padding: '1.5rem', maxHeight: '400px', overflowY: 'auto', border: '1px solid #e2e8f0', marginBottom: '2rem' }}>
                {questions.map((q, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                    style={{ padding: '1rem', background: '#fff', borderRadius: '1rem', marginBottom: '0.75rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', display: 'flex', gap: '1rem' }}>
                    <span style={{ fontWeight: 800, color: '#0ea5e9', fontSize: '0.9rem', fontFamily: "'Space Mono', monospace" }}>{String(i + 1).padStart(2, '0')}</span>
                    <p style={{ fontSize: '0.95rem', color: '#334155', margin: 0 }}>{q}</p>
                  </motion.div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                <button onClick={handleBackToConfig} style={{ padding: '1.125rem', borderRadius: '1rem', background: '#f1f5f9', color: '#475569', fontWeight: 700, border: 'none', cursor: 'pointer' }}>← Adjust</button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleStartInterview}
                  style={{ padding: '1.125rem', borderRadius: '1rem', background: '#0ea5e9', color: '#fff', fontWeight: 800, fontSize: '1.1rem', border: 'none', cursor: 'pointer', boxShadow: '0 8px 16px rgba(14,165,233,0.3)' }}>
                  Enter Interview Room ✦
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ── Interview room ──────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <AnimatePresence>{loading && <LoadingScreen />}</AnimatePresence>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#0ea5e9', marginBottom: '0.35rem' }}>
              Mock session · {effectiveRole}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 'clamp(1.5rem,4vw,2rem)', letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>
                {effectiveRole} Assessment
              </h1>
              {(() => {
                const lc = LEVEL_COLORS[level] || LEVEL_COLORS['Intermediate']
                return <span style={{ padding: '0.2rem 0.65rem', borderRadius: '99px', fontSize: '0.65rem', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", background: lc.bg, color: lc.text, border: `1px solid ${lc.text}33` }}>{lc.label}</span>
              })()}
              <span style={{ padding: '0.2rem 0.65rem', borderRadius: '99px', fontSize: '0.62rem', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", background: questionSource === 'llm' ? 'rgba(139,92,246,0.1)' : 'rgba(148,163,184,0.1)', color: questionSource === 'llm' ? '#8b5cf6' : '#64748b', border: questionSource === 'llm' ? '1px solid rgba(139,92,246,0.25)' : '1px solid rgba(148,163,184,0.2)' }}>
                {questionSource === 'llm' ? '✦ AI' : '📋 Static'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!isRecording && (
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={handleResetSetup} disabled={loading}
                style={{ padding: '0.45rem 1rem', borderRadius: '99px', border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.9)', color: '#64748b', fontSize: '0.72rem', fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: loading ? 0.5 : 1 }}>
                {loading ? '⟳ Loading...' : '⚙ Configuration'}
              </motion.button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 1rem', borderRadius: '99px', border: `1px solid ${isRecording ? 'rgba(225,29,72,0.35)' : 'rgba(148,163,184,0.25)'}`, background: isRecording ? 'rgba(225,29,72,0.06)' : 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', transition: 'all 0.3s' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: isRecording ? '#e11d48' : '#94a3b8', boxShadow: isRecording ? '0 0 8px rgba(225,29,72,0.5)' : 'none', animation: isRecording ? 'recordPulse 1.1s ease-in-out infinite' : 'none' }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', letterSpacing: '0.1em', color: isRecording ? '#e11d48' : '#64748b', transition: 'color 0.3s' }}>
                {isRecording ? `REC ${fmtTime(timer)}` : phase === 'processing' ? 'PROCESSING' : 'STANDBY'}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Status pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.9rem' }}>
        <StatusPill label="backend"    value={backendOk === null ? 'checking' : backendOk ? 'online' : 'offline'}      variant={backendOk === null ? 'info' : backendOk ? 'ok' : 'err'} pulse={backendOk === true} />
        <StatusPill label="camera"     value={avOk.camera === null ? 'checking' : avOk.camera ? 'ready' : 'blocked'}   variant={avOk.camera === null ? 'info' : avOk.camera ? 'ok' : 'err'} />
        <StatusPill label="mic"        value={avOk.mic === null ? 'checking' : avOk.mic ? 'ready' : 'blocked'}         variant={avOk.mic === null ? 'info' : avOk.mic ? 'ok' : 'err'} />
        <StatusPill label="face model" value={faceModelOk === null ? 'loading' : faceModelOk ? 'loaded' : 'error'}     variant={faceModelOk === null ? 'info' : faceModelOk ? 'ok' : 'err'} pulse={faceModelOk === true && isRecording} />
        <StatusPill label="scoring"    value={isRecording ? 'live' : 'paused'}                                         variant={isRecording ? 'ok' : 'warn'} pulse={isRecording} />
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem', alignItems: 'start', marginTop: '1.5rem' }}>
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
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
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: '1.25rem' }}>
              <RealTimeFeedback
                scores={{ facial: liveData.score, speech: liveData.speech }}
                facialMetrics={liveData}
              />
            </motion.div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.5 }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <WebcamRecorder
            isRecording={isRecording}
            mediaStream={mediaStream}
            setMediaStream={setMediaStream}
            onModelStatus={setFaceModelOk}
            onEmotionScore={handleEmotionScore}
          />
          <AudioWave
            mediaStream={mediaStream}
            isRecording={isRecording}
            onSpeechScore={handleSpeechScore}
          />
        </motion.div>
      </div>

      {/* Tips strip */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }}
        style={{ marginTop: '1.5rem', padding: '0.875rem 1.25rem', borderRadius: '1rem', border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(255,255,255,0.85)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
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

// ── Style constants ───────────────────────────────────────────────────────────
const labelStyle = {
  display: 'block', fontSize: '0.75rem', fontWeight: 700,
  color: '#0ea5e9', marginBottom: '0.75rem',
  textTransform: 'uppercase', letterSpacing: '0.1em',
}
const inputStyle = {
  width: '100%', padding: '1rem 1.25rem',
  borderRadius: '1rem', border: '1px solid #e2e8f0',
  fontSize: '1rem', boxSizing: 'border-box',
}
const selectStyle = {
  ...inputStyle, background: '#f8fafc', cursor: 'pointer',
}

export default Interview