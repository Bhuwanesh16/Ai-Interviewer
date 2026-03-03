import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'

const InterviewCard = ({ question, onStart, onStop, isRecording, timer, onNextQuestion, onPrevQuestion, currentIdx, totalQuestions }) => {
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
        border: `1px solid ${isRecording ? 'rgba(225,29,72,0.25)' : 'rgba(148,163,184,0.25)'}`,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(16px)',
        padding: '1.5rem',
        boxShadow: isRecording
          ? '0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(225,29,72,0.1)'
          : '0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.04)',
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
            color: '#0ea5e9',
            marginBottom: '0.3rem',
          }}>Current Question {totalQuestions > 1 ? `(${currentIdx + 1} of ${totalQuestions})` : ''}</p>
          <h2 style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 700,
            fontSize: '1.125rem',
            letterSpacing: '-0.03em',
            color: '#0f172a',
          }}>Interview Prompt</h2>
        </div>

        {/* Live badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.35rem 0.75rem',
          borderRadius: '99px',
          border: '1px solid rgba(5,150,105,0.25)',
          background: 'rgba(5,150,105,0.06)',
        }}>
          <div style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: '#059669',
            boxShadow: '0 0 6px rgba(5,150,105,0.4)',
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
        borderRadius: '1.25rem',
        border: '1px solid rgba(148,163,184,0.15)',
        background: 'rgba(248,250,252,0.8)',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        position: 'relative',
        minHeight: '120px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}>
        {/* Quote mark decoration */}
        <span style={{
          position: 'absolute',
          top: '0.5rem', left: '0.75rem',
          fontFamily: "'Syne', sans-serif",
          fontSize: '3rem',
          color: 'rgba(14,165,233,0.1)',
          lineHeight: 1,
          fontWeight: 800,
          userSelect: 'none',
        }}>"</span>

        <AnimatePresence mode="wait">
          <motion.p
            key={currentIdx}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '1.05rem',
              fontWeight: 500,
              lineHeight: 1.6,
              color: '#334155',
              textAlign: 'center',
              position: 'relative',
              zIndex: 1
            }}
          >
            {question}
          </motion.p>
        </AnimatePresence>

        {/* Floating Arrows */}
        {totalQuestions > 1 && (
          <>
            <motion.button
              whileHover={{ scale: 1.1, x: -2 }}
              whileTap={{ scale: 0.9 }}
              onClick={onPrevQuestion}
              disabled={!onPrevQuestion}
              style={{
                position: 'absolute',
                left: '-1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '40px', height: '40px',
                borderRadius: '50%',
                background: '#fff',
                border: '1px solid rgba(148,163,184,0.2)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                color: onPrevQuestion ? '#0ea5e9' : '#cbd5e1',
                cursor: onPrevQuestion ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.25rem',
                zIndex: 10
              }}
            >
              ←
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1, x: 2 }}
              whileTap={{ scale: 0.9 }}
              onClick={onNextQuestion}
              disabled={!onNextQuestion}
              style={{
                position: 'absolute',
                right: '-1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '40px', height: '40px',
                borderRadius: '50%',
                background: '#fff',
                border: '1px solid rgba(148,163,184,0.2)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                color: onNextQuestion ? '#0ea5e9' : '#cbd5e1',
                cursor: onNextQuestion ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.25rem',
                zIndex: 10
              }}
            >
              →
            </motion.button>
          </>
        )}
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
            color: '#64748b',
          }}>Timer</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '1.75rem',
            fontWeight: 700,
            color: isRecording ? '#e11d48' : '#0f172a',
            textShadow: isRecording ? '0 0 12px rgba(225,29,72,0.3)' : 'none',
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
                background: 'linear-gradient(135deg, #059669, #047857)',
                color: '#fff',
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
                boxShadow: '0 2px 12px rgba(5,150,105,0.35)',
                transition: 'all 0.25s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
              whileHover={{ scale: 1.03, boxShadow: '0 4px 20px rgba(5,150,105,0.4)' }}
              whileTap={{ scale: 0.97 }}
            >
              <div style={{
                width: 8, height: 8,
                borderRadius: '50%',
                background: '#fff',
                opacity: 0.9,
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
              whileHover={{ scale: 1.03, boxShadow: '0 4px 20px rgba(225,29,72,0.45)' }}
              whileTap={{ scale: 0.97 }}
            >
              <div style={{
                width: 8, height: 8,
                borderRadius: '2px',
                background: '#fff',
                opacity: 0.9,
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