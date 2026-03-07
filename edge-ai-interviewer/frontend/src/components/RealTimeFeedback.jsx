import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ScoreCard from './ScoreCard'

const RealTimeFeedback = ({ scores, facialMetrics }) => {
  // scores: { facial: 0-1, speech: 0-1 }
  const [suggestion, setSuggestion] = useState(null)

  // Logic to generate real-time suggestions
  useEffect(() => {
    const { facial, speech } = scores
    const { eyeContact, posture, smile } = facialMetrics || {}

    // Throttle suggestion updates to avoid flickering
    const suggestionTimer = setTimeout(() => {
      let newSuggestion = null

      if (speech < 0.05 && speech > 0) {
        newSuggestion = {
          text: "Voice signal is very weak. Ensure your microphone is positioned correctly and speak up.",
          type: "warning",
          icon: "🎤"
        }
      } else if (eyeContact < 0.4 && facial > 0.1) {
        newSuggestion = {
          text: "Try to maintain steady eye contact with the camera to build professional rapport.",
          type: "improvement",
          icon: "👁️"
        }
      } else if (posture < 0.5 && facial > 0.1) {
        newSuggestion = {
          text: "Head movement detected. Try to keep a stable, forward-facing posture for a professional look.",
          type: "improvement",
          icon: "🧘"
        }
      } else if (facial < 0.2) {
        newSuggestion = {
          text: "Low facial engagement. Try to project more energy and use natural expressions.",
          type: "improvement",
          icon: "🎭"
        }
      } else if (speech > 0.85) {
        newSuggestion = {
          text: "Audio levels are peaking. Consider moving slightly away from the mic.",
          type: "neutral",
          icon: "🔊"
        }
      } else if (eyeContact > 0.75 && posture > 0.75 && facial > 0.5) {
        newSuggestion = {
          text: "Excellent posture and eye contact! You look confident and engaged.",
          type: "success",
          icon: "⭐"
        }
      } else {
        newSuggestion = {
          text: "Good steady delivery. Focus on your pace and explaining the 'Result' of your stories.",
          type: "neutral",
          icon: "⏱️"
        }
      }

      setSuggestion(newSuggestion)
    }, 1000)

    return () => clearTimeout(suggestionTimer)
  }, [scores, facialMetrics])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
        }}
      >
        <ScoreCard label="Emotion signal" score={scores.facial} accent="emerald" />
        <ScoreCard label="Speech clarity" score={scores.speech} accent="sky" />
      </div>

      <AnimatePresence mode="wait">
        {suggestion && (
          <motion.div
            key={suggestion.text}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              padding: '1rem 1.25rem',
              borderRadius: '1rem',
              background: suggestion.type === 'success' ? 'rgba(16,185,129,0.06)' :
                suggestion.type === 'warning' ? 'rgba(245,158,11,0.06)' :
                  suggestion.type === 'improvement' ? 'rgba(99,102,241,0.06)' :
                    'rgba(248,250,252,0.8)',
              border: `1px solid ${suggestion.type === 'success' ? 'rgba(16,185,129,0.2)' :
                suggestion.type === 'warning' ? 'rgba(245,158,11,0.2)' :
                  suggestion.type === 'improvement' ? 'rgba(99,102,241,0.2)' :
                    'rgba(148,163,184,0.1)'
                }`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              transition: 'all 0.3s ease'
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>{suggestion.icon}</span>
            <div>
              <p style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: suggestion.type === 'success' ? '#059669' :
                  suggestion.type === 'warning' ? '#d97706' :
                    suggestion.type === 'improvement' ? '#4f46e5' :
                      '#475569',
                margin: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.025em'
              }}>
                {suggestion.type === 'improvement' ? 'Suggestion' :
                  suggestion.type === 'warning' ? 'Alert' :
                    suggestion.type === 'success' ? 'Doing Great' : 'Feedback'}
              </p>
              <p style={{
                fontSize: '0.9rem',
                color: '#1e293b',
                margin: '2px 0 0 0',
                fontFamily: "'DM Sans', sans-serif"
              }}>
                {suggestion.text}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default RealTimeFeedback
