import { motion } from 'framer-motion'

const ScoreTimeline = ({ timeline }) => {
  if (!timeline || timeline.length === 0) return null

  return (
    <div style={{ marginTop: '2rem' }}>
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: '1.25rem',
          fontWeight: 700,
          color: '#0f172a',
          marginBottom: '0.75rem',
        }}
      >
        Real‑time score history
      </motion.h2>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Time</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Emotion</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>Speech</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((entry, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.5rem' }}>{entry.time}s</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{Math.round(entry.facial * 100)}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{Math.round(entry.speech * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ScoreTimeline
