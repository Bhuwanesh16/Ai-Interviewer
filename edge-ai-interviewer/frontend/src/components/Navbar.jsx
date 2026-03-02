import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'

const Navbar = () => {
  const location = useLocation()
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })()
  const [hovered, setHovered] = useState(null)

  const links = [
    { to: '/', label: 'Home' },
    { to: '/register', label: 'Register' },
    { to: '/interview', label: 'Interview' },
  ]

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/'
  }

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 200,
      background: 'rgba(255, 255, 255, 0.88)',
      backdropFilter: 'blur(20px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
      borderBottom: '1px solid rgba(148,163,184,0.25)',
      boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
    }}>
      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '0 1.5rem',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1.5rem',
      }}>
        {/* Brand */}
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <img
            src="/logo.png"
            alt="InterviewAI Logo"
            style={{
              width: 32, height: 32,
              borderRadius: '0.6rem',
              boxShadow: '0 4px 12px rgba(14,165,233,0.25)',
              background: '#fff',
              padding: '2px',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          />
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '1.125rem',
            letterSpacing: '-0.04em',
            color: '#0f172a',
          }}>
            InterviewAI
          </span>
        </Link>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {links.map(({ to, label }) => {
            const isInterviewRoute =
              to === '/interview' &&
              (location.pathname.startsWith('/interview') ||
                location.pathname.startsWith('/result'))
            const active = isInterviewRoute || location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                onMouseEnter={() => setHovered(to)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  textDecoration: 'none',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '0.5rem',
                  color: active ? '#0ea5e9' : hovered === to ? '#0ea5e9' : '#64748b',
                  background: active ? 'rgba(14,165,233,0.08)' : hovered === to ? 'rgba(14,165,233,0.05)' : 'transparent',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                {label}
                {active && (
                  <span style={{
                    position: 'absolute',
                    bottom: 0, left: '0.75rem', right: '0.75rem',
                    height: 1,
                    background: 'linear-gradient(90deg, transparent, #0ea5e9, transparent)',
                    borderRadius: 99,
                  }} />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Auth */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {user ? (
            <>
              <span style={{
                fontSize: '0.75rem',
                color: '#475569',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {user.name || user.email}
              </span>
              <button
                onClick={handleLogout}
                style={{
                  fontSize: '0.75rem',
                  color: '#64748b',
                  background: 'rgba(255,255,255,0.9)',
                  border: '1px solid rgba(148,163,184,0.3)',
                  borderRadius: '0.5rem',
                  padding: '0.3rem 0.7rem',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.2s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(225,29,72,0.5)'
                  e.currentTarget.style.color = '#e11d48'
                  e.currentTarget.style.background = 'rgba(225,29,72,0.06)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(148,163,184,0.3)'
                  e.currentTarget.style.color = '#64748b'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.9)'
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/register"
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                textDecoration: 'none',
                color: '#fff',
                background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                padding: '0.35rem 0.9rem',
                borderRadius: '99px',
                boxShadow: '0 2px 12px rgba(14,165,233,0.35)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(14,165,233,0.45)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 2px 12px rgba(14,165,233,0.35)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

export default Navbar