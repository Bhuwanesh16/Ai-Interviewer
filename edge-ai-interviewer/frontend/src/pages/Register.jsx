import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { loginUser, registerUser } from '../services/api'

const inputStyle = {
  width: '100%',
  background: 'rgba(2,6,15,0.9)',
  border: '1px solid rgba(56,189,248,0.1)',
  color: '#f0f9ff',
  borderRadius: '0.75rem',
  padding: '0.65rem 0.875rem',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '0.875rem',
  outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
}

const InputField = ({ label, type, name, value, onChange, required }) => {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <label style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '0.65rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: focused ? '#38bdf8' : '#334155',
        transition: 'color 0.2s ease',
      }}>
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...inputStyle,
          borderColor: focused ? '#0ea5e9' : 'rgba(56,189,248,0.1)',
          boxShadow: focused
            ? '0 0 0 3px rgba(14,165,233,0.12), 0 0 20px rgba(14,165,233,0.08)'
            : 'none',
        }}
      />
    </div>
  )
}

const Register = () => {
  const navigate = useNavigate()
  const [mode, setMode] = useState('register')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = mode === 'register'
        ? form
        : { email: form.email, password: form.password }
      const fn = mode === 'register' ? registerUser : loginUser
      const { data } = await fn(payload)
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      navigate('/interview')
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
      position: 'relative',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        top: '20%', left: '50%',
        transform: 'translateX(-50%)',
        width: 500, height: 400,
        background: 'radial-gradient(ellipse, rgba(56,189,248,0.07) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: '1.5rem',
          border: '1px solid rgba(56,189,248,0.1)',
          background: 'rgba(8,20,40,0.85)',
          backdropFilter: 'blur(20px)',
          padding: '2rem',
          boxShadow: '0 4px 40px rgba(0,0,0,0.6), 0 0 60px rgba(56,189,248,0.05)',
          position: 'relative',
        }}
      >
        {/* Corner accent */}
        <div style={{
          position: 'absolute',
          top: 0, right: 0,
          width: 120, height: 120,
          background: 'radial-gradient(ellipse at 100% 0%, rgba(56,189,248,0.06) 0%, transparent 70%)',
          borderRadius: '0 1.5rem 0 0',
          pointerEvents: 'none',
        }} />

        {/* Mode toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
          <div>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.6rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#38bdf8',
              textShadow: '0 0 14px rgba(56,189,248,0.4)',
              marginBottom: '0.4rem',
            }}>
              {mode === 'register' ? 'Create account' : 'Welcome back'}
            </p>
            <h2 style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 700,
              fontSize: '1.375rem',
              color: '#f0f9ff',
              letterSpacing: '-0.03em',
            }}>
              {mode === 'register' ? 'Start practicing interviews' : 'Sign in to continue'}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => { setMode(m => m === 'register' ? 'login' : 'register'); setError('') }}
            style={{
              fontSize: '0.75rem',
              color: '#38bdf8',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              padding: '0.25rem 0',
              textDecoration: 'underline',
              textDecorationColor: 'rgba(56,189,248,0.3)',
              textUnderlineOffset: 3,
              transition: 'color 0.2s ease',
              flexShrink: 0,
              marginTop: '0.25rem',
            }}
          >
            {mode === 'register' ? 'Sign in instead' : 'Register'}
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <AnimatePresence>
            {mode === 'register' && (
              <motion.div
                key="name"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                <InputField
                  label="Name"
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                />
              </motion.div>
            )}
          </AnimatePresence>

          <InputField label="Email" type="email" name="email" value={form.email} onChange={handleChange} required />
          <InputField label="Password" type="password" name="password" value={form.password} onChange={handleChange} required />

          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  padding: '0.625rem 0.875rem',
                  borderRadius: '0.625rem',
                  background: 'rgba(251,113,133,0.07)',
                  border: '1px solid rgba(251,113,133,0.2)',
                  borderLeft: '3px solid #fb7185',
                  fontSize: '0.8rem',
                  color: '#fda4af',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '0.5rem',
              width: '100%',
              padding: '0.75rem',
              borderRadius: '0.875rem',
              border: 'none',
              background: loading
                ? 'rgba(14,165,233,0.3)'
                : 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 55%, #0369a1 100%)',
              color: loading ? '#94a3b8' : '#031220',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 0 24px rgba(56,189,248,0.3), 0 4px 14px rgba(0,0,0,0.4)',
              transition: 'all 0.25s ease',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <span style={{
                  width: 14, height: 14,
                  borderRadius: '50%',
                  border: '2px solid rgba(56,189,248,0.2)',
                  borderTopColor: '#38bdf8',
                  display: 'inline-block',
                  animation: 'spin 0.8s linear infinite',
                }} />
                Processing...
              </span>
            ) : (
              mode === 'register' ? 'Create account →' : 'Sign in →'
            )}
          </button>
        </form>

        {/* Footer note */}
        <p style={{
          marginTop: '1.25rem',
          textAlign: 'center',
          fontSize: '0.7rem',
          color: '#1e293b',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          Your data stays on-device · No cloud required
        </p>
      </motion.div>
    </div>
  )
}

export default Register