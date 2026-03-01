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

  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const ensureSession = async () => {
    if (sessionId) return sessionId
    const { data } = await startInterview({ position: role })
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
          navigate(`/result/${data.session_id}`, {
            state: { scores: data.scores, transcript: data.transcript },
          })
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
    setLoading(true)
    try {
      const { data } = await generateQuestions({ role, skills, level, numQuestions })
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setIsSetupComplete(true)
    }
  }

  if (!isSetupComplete) {
    return (
      <div style={{ maxWidth: 600, margin: '4rem auto', padding: '2.5rem', borderRadius: '1.5rem', background: '#fff', border: '1px solid rgba(148,163,184,0.2)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.75rem', marginBottom: '0.5rem', color: '#0f172a' }}>
          Interview Setup
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '2rem' }}>Define your role and skills to generate tailored interview questions.</p>
        <form onSubmit={handleSetupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Role</label>
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="e.g. Frontend Developer"
              required
              style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', outline: 'none', fontSize: '1rem', color: '#1e293b' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Key Skills</label>
            <input
              value={skills}
              onChange={e => setSkills(e.target.value)}
              placeholder="e.g. React, Node.js, Python (comma separated)"
              required
              style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', outline: 'none', fontSize: '1rem', color: '#1e293b' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Experience Level</label>
              <select
                value={level}
                onChange={e => setLevel(e.target.value)}
                style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', outline: 'none', fontSize: '1rem', color: '#1e293b', background: '#fff' }}
              >
                <option>Entry Level</option>
                <option>Intermediate</option>
                <option>Senior</option>
                <option>Lead / Manager</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>No. of Questions</label>
              <input
                type="number"
                min="1"
                max="10"
                value={numQuestions}
                onChange={e => setNumQuestions(parseInt(e.target.value))}
                style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', outline: 'none', fontSize: '1rem', color: '#1e293b' }}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '1rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
              marginTop: '1rem',
              boxShadow: '0 4px 14px rgba(14,165,233,0.3)'
            }}
          >
            {loading ? 'Preparing your session...' : 'Start Interview'}
          </button>
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
            }}>Mock session</p>
            <h1 style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: 'clamp(1.5rem, 4vw, 2rem)',
              letterSpacing: '-0.04em',
              color: '#0f172a',
            }}>Interview Room</h1>
          </div>

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
            onNextQuestion={currentQuestionIndex < questions.length - 1 ? () => setCurrentQuestionIndex(i => i + 1) : null}
            onPrevQuestion={currentQuestionIndex > 0 ? () => setCurrentQuestionIndex(i => i - 1) : null}
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