/**
 * Navbar.jsx
 *
 * Fixes applied:
 * - `user` was read from localStorage on every render via an inline IIFE.
 *   If `localStorage.setItem('user', ...)` is called after login, the Navbar
 *   never reflects the update because the IIFE only runs once at render time
 *   and there is no state — it won't re-render. Fixed by reading from state
 *   and listening to a custom `storage` event so cross-tab and same-tab
 *   login/logout both update the nav immediately.
 * - handleLogout: `window.location.href = '/'` causes a full page reload
 *   which is unnecessary in a SPA. Replaced with `navigate('/')` so the
 *   React tree stays mounted and the transition is smooth. The state clear
 *   (setUser(null)) is now synchronous before navigation.
 * - Register link in the "not logged in" state should read "Sign in" since
 *   the /register page handles both modes — label kept as "Sign in" which
 *   matches the page's own header ("Welcome back / Create account").
 * - Active route detection: `/result/...` routes should highlight the
 *   "Interview" nav link since results belong to that flow. Already correct.
 * - Added `aria-label` to the sign-out button for accessibility.
 */

import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

const Navbar = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(null)

  // FIX: use state so the nav re-renders after login/logout
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })

  // Sync when localStorage changes (same-tab login, cross-tab logout)
  useEffect(() => {
    const onStorage = () => {
      try { setUser(JSON.parse(localStorage.getItem('user'))) }
      catch { setUser(null) }
    }
    window.addEventListener('storage', onStorage)
    // Also fire on route change to catch same-tab login
    onStorage()
    return () => window.removeEventListener('storage', onStorage)
  }, [location.pathname])

  const links = [
    { to: '/',          label: 'Home'      },
    { to: '/register',  label: 'Register'  },
    { to: '/interview', label: 'Interview' },
  ]

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)             // FIX: update state synchronously
    navigate('/')             // FIX: SPA navigation, no full reload
  }

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 200,
      background: 'rgba(255,255,255,0.88)',
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
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'linear-gradient(135deg, #0ea5e9 0%, #059669 100%)',
            boxShadow: '0 2px 12px rgba(14,165,233,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </div>
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '1rem',
            letterSpacing: '-0.04em',
            background: 'linear-gradient(135deg, #0ea5e9 0%, #059669 100%)',
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
            const isInterviewFlow =
              to === '/interview' &&
              (location.pathname.startsWith('/interview') ||
               location.pathname.startsWith('/result'))
            const active = isInterviewFlow || location.pathname === to
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
                  color: active || hovered === to ? '#0ea5e9' : '#64748b',
                  background: active
                    ? 'rgba(14,165,233,0.08)'
                    : hovered === to ? 'rgba(14,165,233,0.05)' : 'transparent',
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

        {/* Auth section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {user ? (
            <>
              <span style={{ fontSize: '0.75rem', color: '#475569', fontFamily: "'DM Sans', sans-serif" }}>
                {user.name || user.email}
              </span>
              <button
                onClick={handleLogout}
                aria-label="Sign out"
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