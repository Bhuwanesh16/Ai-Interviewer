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
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">
        Multi-modal profile
      </p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ReRadarChart data={data}>
            <PolarGrid stroke="#1e293b" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <PolarRadiusAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              angle={30}
              domain={[0, 100]}
            />
            <Radar
              name="Score"
              dataKey="value"
              stroke="#38bdf8"
              fill="#0ea5e9"
              fillOpacity={0.5}
            />
          </ReRadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default RadarChart

