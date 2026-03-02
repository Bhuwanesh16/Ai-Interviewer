import {
  Radar,
  RadarChart as ReRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'

const RadarChart = ({ scores }) => {
  const data = [
    { metric: 'Emotion', value: Math.round((scores.facial || 0) * 100) },
    { metric: 'Speech', value: Math.round((scores.speech || 0) * 100) },
    { metric: 'Content', value: Math.round((scores.nlp || 0) * 100) },
    { metric: 'Overall', value: Math.round((scores.final || 0) * 100) },
  ]

  return (
    <div style={{
      borderRadius: '1.25rem',
      border: '1px solid rgba(148,163,184,0.25)',
      background: 'rgba(255,255,255,0.95)',
      padding: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <p style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '0.65rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: '#64748b',
        marginBottom: '0.5rem',
      }}>
        Multi-modal profile
      </p>
      <div style={{ height: 256 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ReRadarChart data={data}>
            <PolarGrid stroke="rgba(148,163,184,0.25)" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748b', fontSize: 11 }} />
            <PolarRadiusAxis
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              angle={30}
              domain={[0, 100]}
            />
            <Radar
              name="Score"
              dataKey="value"
              stroke="#0ea5e9"
              strokeWidth={2}
              fill="url(#scoreGradient)"
              fillOpacity={0.65}
            />
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.5} />
              </linearGradient>
            </defs>
          </ReRadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default RadarChart

