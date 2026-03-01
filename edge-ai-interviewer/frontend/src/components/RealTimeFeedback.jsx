import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ScoreCard from './ScoreCard'

const RealTimeFeedback = ({ scores }) => {
  // scores: { facial: 0-1, speech: 0-1 }
  const [suggestion, setSuggestion] = useState(null)

  // Logic to generate real-time suggestions
  useEffect(() => {
    const { facial, speech } = scores

    let newSuggestion = null

    if (facial < 0.25) {
      newSuggestion = {
        text: "Low facial engagement detected. Try to exhibit more enthusiasm and natural expressions.",
        type: "improvement",
        icon: "🎭"
      }
    } else if (speech < 0.05) {
      newSuggestion = {
        text: "Voice signal is very weak. Ensure your microphone is positioned correctly and speak up.",
        type: "warning",
        icon: "🎤"
      }
    } else if (speech > 0.85) {
      newSuggestion = {
        text: "Audio levels are peaking. Consider moving slightly away from the mic for better clarity.",
        type: "neutral",
        icon: "🔊"
      }
    } else if (facial > 0.6 && speech > 0.2) {
      newSuggestion = {
        text: "Excellent presence! Your energy levels and engagement are currently optimal.",
        type: "success",
        icon: "⭐"
      }
    } else if (facial < 0.45) {
      newSuggestion = {
        text: "Consider maintaining a more consistent smile to appear more approachable.",
        type: "improvement",
        icon: "😊"
      }
    } else {
      newSuggestion = {
        text: "Good steady delivery. Focus on your pace and maintaining eye contact.",
        type: "neutral",
        icon: "⏱️"
      }
    }

    setSuggestion(newSuggestion)
  }, [scores])

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
