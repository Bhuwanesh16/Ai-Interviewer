/**
 * LoadingScreen.jsx — updated step timing
 *
 * Steps now reflect actual pipeline timing after parallel processing fix:
 * - Video processing:  ~1-2s  (was labeled as if it took 8s)
 * - Speech analysis:   ~1s
 * - Content scoring:   ~1s    (NLP is fast, parallel)
 * - Report generation: ~1s
 * Total expected: 3-5s instead of previous 15-30s
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const STEPS = [
  { icon: '🎬', text: 'Processing your video response…'    },
  { icon: '🎙️', text: 'Analysing speech clarity…'          },
  { icon: '🧠', text: 'Scoring content relevance…'         },
  { icon: '📊', text: 'Generating performance report…'     },
]

const LoadingScreen = () => {
  const [stepIdx, setStepIdx] = useState(0)
  const [dots,    setDots]    = useState('')

  // Cycle steps every 1.2s — matches actual ~5s total pipeline time
  useEffect(() => {
    const t = setInterval(() => setStepIdx(i => (i + 1) % STEPS.length), 1200)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 350)
    return () => clearInterval(t)
  }, [])

  const step = STEPS[stepIdx]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,23,42,0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        style={{
          borderRadius: '1.75rem',
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(15,23,42,0.9)',
          padding: '2.5rem 3rem',
          textAlign: 'center',
          maxWidth: 380, width: '90vw',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Spinner */}
        <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 1.75rem' }}>
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(14,165,233,0.1)" strokeWidth="4" />
            <circle
              cx="36" cy="36" r="28"
              fill="none" stroke="url(#spinGrad)"
              strokeWidth="4" strokeLinecap="round"
              strokeDasharray="176" strokeDashoffset="132"
              style={{ transformOrigin: '50% 50%', animation: 'spin 0.9s linear infinite' }}
            />
            <defs>
              <linearGradient id="spinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>
          <AnimatePresence mode="wait">
            <motion.span
              key={stepIdx}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.5rem',
              }}
            >
              {step.icon}
            </motion.span>
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          <motion.p
            key={stepIdx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.9375rem', fontWeight: 600,
              color: '#e2e8f0', marginBottom: '0.5rem', lineHeight: 1.5,
            }}
          >
            {step.text}{dots}
          </motion.p>
        </AnimatePresence>

        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.65rem', letterSpacing: '0.1em',
          color: '#475569', margin: '0 0 1.75rem',
        }}>
          Parallel multi-modal analysis
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
          {STEPS.map((_, i) => (
            <motion.div
              key={i}
              animate={{
                width: i === stepIdx ? 20 : 6,
                background: i === stepIdx ? '#0ea5e9' : 'rgba(148,163,184,0.3)',
              }}
              transition={{ duration: 0.25 }}
              style={{ height: 6, borderRadius: 99 }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default LoadingScreen