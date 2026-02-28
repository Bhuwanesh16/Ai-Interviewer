import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'

const InterviewCard = ({ question, onStart, onStop, isRecording, timer }) => {
  const fmtTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    if (!isRecording) return
    const id = setInterval(() => setPulse(p => !p), 600)
    return () => clearInterval(id)
  }, [isRecording])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        borderRadius: '1.5rem',
        border: `1px solid ${isRecording ? 'rgba(251,113,133,0.2)' : 'rgba(56,189,248,0.1)'}`,
        background: 'rgba(8,20,40,0.85)',
        backdropFilter: 'blur(16px)',
        padding: '1.5rem',
        boxShadow: isRecording
          ? '0 4px 32px rgba(0,0,0,0.6), 0 0 30px rgba(251,113,133,0.08)'
          : '0 4px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02) inset',
        transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Corner glow */}
      <div style={{
        position: 'absolute',
        top: 0, right: 0,
        width: 160, height: 160,
        background: isRecording
          ? 'radial-gradient(ellipse at 100% 0%, rgba(251,113,133,0.06) 0%, transparent 70%)'
          : 'radial-gradient(ellipse at 100% 0%, rgba(56,189,248,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
        transition: 'background 0.4s ease',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#38bdf8',
            textShadow: '0 0 12px rgba(56,189,248,0.4)',
            marginBottom: '0.3rem',
          }}>Current Question</p>
          <h2 style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 700,
            fontSize: '1.125rem',
            letterSpacing: '-0.03em',
            color: '#f0f9ff',
          }}>Interview Prompt</h2>
        </div>

        {/* Live badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.35rem 0.75rem',
          borderRadius: '99px',
          border: '1px solid rgba(52,211,153,0.2)',
          background: 'rgba(52,211,153,0.06)',
        }}>
          <div style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: '#34d399',
            boxShadow: '0 0 6px rgba(52,211,153,0.8)',
            animation: 'recordPulse 1.8s ease-in-out infinite',
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.12em',
            color: '#34d399',
          }}>LIVE</span>
        </div>
      </div>

      {/* Question text */}
      <div style={{
        borderRadius: '1rem',
        border: '1px solid rgba(56,189,248,0.07)',
        background: 'rgba(2,6,15,0.5)',
        padding: '1.125rem',
        marginBottom: '1.5rem',
        position: 'relative',
      }}>
        {/* Quote mark */}
        <span style={{
          position: 'absolute',
          top: '0.5rem', left: '0.875rem',
          fontFamily: "'Syne', sans-serif",
          fontSize: '2rem',
          color: 'rgba(56,189,248,0.12)',
          lineHeight: 1,
          fontWeight: 800,
          userSelect: 'none',
        }}>"</span>
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.9375rem',
          lineHeight: 1.75,
          color: '#94a3b8',
          paddingTop: '0.5rem',
          paddingLeft: '0.5rem',
        }}>{question}</p>
      </div>

      {/* Timer + Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Timer */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#1e293b',
          }}>Timer</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '1.75rem',
            fontWeight: 700,
            color: isRecording ? '#fb7185' : '#1e3a5f',
            textShadow: isRecording ? '0 0 20px rgba(251,113,133,0.5)' : 'none',
            transition: 'color 0.3s ease, text-shadow 0.3s ease',
            letterSpacing: '-0.02em',
          }}>
            {fmtTime(timer)}
          </span>
        </div>

        {/* Buttons */}
        <AnimatePresence mode="wait">
          {!isRecording ? (
            <motion.button
              key="start"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              onClick={onStart}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.375rem',
                borderRadius: '99px',
                border: 'none',
                background: 'linear-gradient(135deg, #34d399, #059669)',
                color: '#022c22',
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
                boxShadow: '0 0 22px rgba(52,211,153,0.35), 0 4px 14px rgba(0,0,0,0.4)',
                transition: 'all 0.25s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
              whileHover={{ scale: 1.03, boxShadow: '0 0 36px rgba(52,211,153,0.5), 0 6px 20px rgba(0,0,0,0.5)' }}
              whileTap={{ scale: 0.97 }}
            >
              <div style={{
                width: 8, height: 8,
                borderRadius: '50%',
                background: '#022c22',
                opacity: 0.7,
              }} />
              Start Recording
            </motion.button>
          ) : (
            <motion.button
              key="stop"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              onClick={onStop}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.375rem',
                borderRadius: '99px',
                border: 'none',
                background: 'linear-gradient(135deg, #fb7185, #e11d48)',
                color: '#fff0f3',
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
                boxShadow: '0 0 22px rgba(251,113,133,0.4), 0 4px 14px rgba(0,0,0,0.4)',
                transition: 'all 0.25s ease',
              }}
              whileHover={{ scale: 1.03, boxShadow: '0 0 36px rgba(251,113,133,0.55), 0 6px 20px rgba(0,0,0,0.5)' }}
              whileTap={{ scale: 0.97 }}
            >
              <div style={{
                width: 8, height: 8,
                borderRadius: '2px',
                background: '#fff0f3',
                opacity: 0.8,
              }} />
              Stop & Submit
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Progress line at bottom when recording */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ scaleX: 0, opacity: 0 }}
            style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: 2,
              background: 'linear-gradient(90deg, transparent, #fb7185, #f43f5e, transparent)',
              transformOrigin: 'left',
              boxShadow: '0 0 8px rgba(251,113,133,0.6)',
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default InterviewCard