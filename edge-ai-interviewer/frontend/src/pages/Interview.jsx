import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import InterviewCard from '../components/InterviewCard'
import WebcamRecorder from '../components/WebcamRecorder'
import AudioWave from '../components/AudioWave'
import LoadingScreen from '../components/LoadingScreen'
import { startInterview, submitInterview } from '../services/api'

const DEFAULT_QUESTION = 'Tell me about a time you solved a challenging technical problem.'

const Interview = () => {
  const navigate = useNavigate()
  const [sessionId, setSessionId] = useState(null)
  const [question] = useState(DEFAULT_QUESTION)
  const [timer, setTimer] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [mediaStream, setMediaStream] = useState(null)
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

  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`

  const ensureSession = async () => {
    if (sessionId) return sessionId
    const { data } = await startInterview({ position: 'Software Engineer' })
    setSessionId(data.session_id)
    return data.session_id
  }

  const handleStart = async () => {
    try {
      await ensureSession()
      if (!mediaStream) return
      const recorder = new MediaRecorder(mediaStream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        setLoading(true)
        setPhase('processing')
        try {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' })
          const session = await ensureSession()
          const formData = new FormData()
          formData.append('session_id', session)
          formData.append('question', question)
          formData.append('video', blob, 'response.webm')
          formData.append('audio', blob, 'response.webm')
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
              color: '#38bdf8',
              textShadow: '0 0 14px rgba(56,189,248,0.4)',
              marginBottom: '0.35rem',
            }}>Mock session</p>
            <h1 style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: 'clamp(1.5rem, 4vw, 2rem)',
              letterSpacing: '-0.04em',
              color: '#f0f9ff',
            }}>Interview Room</h1>
          </div>

          {/* Status indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.625rem',
            padding: '0.5rem 1rem',
            borderRadius: '99px',
            border: `1px solid ${isRecording ? 'rgba(251,113,133,0.3)' : 'rgba(56,189,248,0.12)'}`,
            background: isRecording ? 'rgba(251,113,133,0.06)' : 'rgba(8,20,40,0.6)',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.3s ease',
          }}>
            <div style={{
              width: 7, height: 7,
              borderRadius: '50%',
              background: isRecording ? '#fb7185' : '#334155',
              boxShadow: isRecording ? '0 0 8px rgba(251,113,133,0.8)' : 'none',
              animation: isRecording ? 'recordPulse 1.1s ease-in-out infinite' : 'none',
            }} />
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.65rem',
              letterSpacing: '0.1em',
              color: isRecording ? '#fda4af' : '#334155',
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
          />
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
          />
          <AudioWave mediaStream={mediaStream} isRecording={isRecording} />
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
          border: '1px solid rgba(56,189,248,0.06)',
          background: 'rgba(8,20,40,0.4)',
          display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center',
        }}
      >
        {['Speak clearly at a measured pace', 'Maintain eye contact with the camera', 'Structure answers: Situation → Action → Result'].map((tip, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#1e3a4c', flexShrink: 0 }} />
            <span style={{ fontSize: '0.75rem', color: '#334155', fontFamily: "'DM Sans', sans-serif" }}>{tip}</span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

export default Interview