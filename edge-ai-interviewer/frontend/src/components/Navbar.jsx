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
      background: 'rgba(2, 4, 9, 0.78)',
      backdropFilter: 'blur(20px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
      borderBottom: '1px solid rgba(56,189,248,0.08)',
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
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: 28, height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #38bdf8 0%, #34d399 100%)',
            boxShadow: '0 0 14px rgba(56,189,248,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#020d18" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </div>
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '1rem',
            letterSpacing: '-0.04em',
            background: 'linear-gradient(135deg, #38bdf8 0%, #34d399 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            InterviewAI
          </span>
        </Link>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {links.map(({ to, label }) => {
            const active = location.pathname === to
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
                  color: active ? '#38bdf8' : hovered === to ? '#38bdf8' : '#64748b',
                  background: active ? 'rgba(56,189,248,0.07)' : 'transparent',
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
                    background: 'linear-gradient(90deg, transparent, #38bdf8, transparent)',
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
                  background: 'transparent',
                  border: '1px solid rgba(148,163,184,0.15)',
                  borderRadius: '0.5rem',
                  padding: '0.3rem 0.7rem',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => {
                  e.target.style.borderColor = 'rgba(251,113,133,0.4)'
                  e.target.style.color = '#fb7185'
                }}
                onMouseLeave={e => {
                  e.target.style.borderColor = 'rgba(148,163,184,0.15)'
                  e.target.style.color = '#64748b'
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
                color: '#020d18',
                background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
                padding: '0.35rem 0.9rem',
                borderRadius: '99px',
                boxShadow: '0 0 16px rgba(56,189,248,0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.target.style.boxShadow = '0 0 28px rgba(56,189,248,0.5)'
                e.target.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.target.style.boxShadow = '0 0 16px rgba(56,189,248,0.3)'
                e.target.style.transform = 'translateY(0)'
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