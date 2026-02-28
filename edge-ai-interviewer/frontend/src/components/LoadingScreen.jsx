import { motion } from 'framer-motion'

const steps = [
  { label: 'Emotion model', color: '#34d399', delay: 0 },
  { label: 'Speech analysis', color: '#38bdf8', delay: 0.4 },
  { label: 'NLP scoring',    color: '#a78bfa', delay: 0.8 },
]

const LoadingScreen = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(2,4,9,0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      {/* Background glow */}
      <div style={{
        position: 'absolute',
        width: 400, height: 400,
        background: 'radial-gradient(ellipse, rgba(56,189,248,0.07) 0%, transparent 65%)',
        pointerEvents: 'none',
        animation: 'float 6s ease-in-out infinite',
      }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{
          borderRadius: '1.5rem',
          border: '1px solid rgba(56,189,248,0.12)',
          background: 'rgba(8,20,40,0.95)',
          padding: '2.25rem 2.5rem',
          boxShadow: '0 4px 48px rgba(0,0,0,0.7), 0 0 60px rgba(56,189,248,0.06)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.75rem',
          minWidth: 320,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Scanline */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          height: 2,
          background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.3), transparent)',
          animation: 'scanline 3s linear infinite',
          pointerEvents: 'none',
        }} />

        {/* Orbit spinner */}
        <div style={{ position: 'relative', width: 64, height: 64 }}>
          {/* Outer ring */}
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '1px solid rgba(56,189,248,0.12)',
            borderTopColor: '#38bdf8',
            animation: 'spin 1.2s linear infinite',
            boxShadow: '0 0 16px rgba(56,189,248,0.2)',
          }} />
          {/* Inner ring */}
          <div style={{
            position: 'absolute',
            inset: 10,
            borderRadius: '50%',
            border: '1px solid rgba(167,139,250,0.12)',
            borderBottomColor: '#a78bfa',
            animation: 'spin 0.8s linear infinite reverse',
          }} />
          {/* Core dot */}
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              width: 8, height: 8,
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: '0 0 12px rgba(56,189,248,0.8)',
              animation: 'recordPulse 1s ease-in-out infinite',
            }} />
          </div>
        </div>

        {/* Text */}
        <div style={{ textAlign: 'center' }}>
          <p style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 700,
            fontSize: '1.0625rem',
            letterSpacing: '-0.02em',
            color: '#f0f9ff',
            marginBottom: '0.375rem',
          }}>
            Analyzing your response
          </p>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.8rem',
            color: '#334155',
            lineHeight: 1.6,
          }}>
            Running local models on your interview data
          </p>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', width: '100%' }}>
          {steps.map((step, i) => (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: step.delay, duration: 0.4 }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            >
              <div style={{
                width: 20, height: 20,
                borderRadius: '50%',
                border: `1px solid ${step.color}33`,
                background: `${step.color}11`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div style={{
                  width: 5, height: 5,
                  borderRadius: '50%',
                  background: step.color,
                  boxShadow: `0 0 6px ${step.color}`,
                  animation: `recordPulse ${1 + i * 0.2}s ease-in-out infinite`,
                  animationDelay: `${step.delay}s`,
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.65rem',
                    letterSpacing: '0.08em',
                    color: '#475569',
                  }}>{step.label}</span>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.6rem',
                    color: step.color,
                  }}>running…</span>
                </div>
                <div style={{ height: 2, borderRadius: 99, background: 'rgba(56,189,248,0.06)', overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ delay: step.delay + 0.1, duration: 2.5, ease: 'easeInOut' }}
                    style={{
                      height: '100%',
                      borderRadius: 99,
                      background: `linear-gradient(90deg, ${step.color}66, ${step.color})`,
                      boxShadow: `0 0 6px ${step.color}66`,
                    }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default LoadingScreen