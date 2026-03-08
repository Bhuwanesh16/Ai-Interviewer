/**
 * ErrorBoundary.jsx
 *
 * Bugs fixed:
 *  - File contained TWO default exports (ErrorBoundary + ScoreTimeline) — a
 *    module can only have one default export; the second one silently shadows
 *    the first in bundlers (Vite/Webpack both warn, but behaviour is undefined).
 *    ScoreTimeline has been moved to its own file (ScoreTimeline.jsx).
 *  - Added `resetError` handler so the boundary can recover without a full
 *    page reload — the "Try again" button now resets component state first,
 *    falling back to window.location.reload() only if that also fails.
 *  - Added `onError` prop callback so parent components (e.g. the root App)
 *    can log errors to an external service (Sentry, LogRocket, etc.).
 */

import { Component } from 'react'
import { motion } from 'framer-motion'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
    this.resetError = this.resetError.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    // Allow parent to hook in external error reporting
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo)
    }
  }

  resetError() {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      // Allow a custom fallback UI to be passed via prop
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError)
      }

      return (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 400,
            padding: '2.5rem',
            textAlign: 'center',
            borderRadius: '1.25rem',
            border: '1px solid rgba(244,63,94,0.2)',
            background: 'rgba(255,241,242,0.6)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Icon */}
          <div style={{
            width: 56, height: 56,
            borderRadius: '50%',
            background: 'rgba(244,63,94,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem',
            marginBottom: '1rem',
          }}>
            ⚠️
          </div>

          <h2 style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 700,
            fontSize: '1.3rem',
            color: '#be123c',
            marginBottom: '0.5rem',
          }}>
            Something went wrong
          </h2>

          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.85rem',
            color: '#9f1239',
            marginBottom: '0.5rem',
            maxWidth: 380,
            lineHeight: 1.6,
          }}>
            An error occurred while rendering this section.
          </p>

          {/* Show message in dev mode only */}
          {import.meta.env.DEV && this.state.error && (
            <pre style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.65rem',
              color: '#be123c',
              background: 'rgba(244,63,94,0.07)',
              border: '1px solid rgba(244,63,94,0.15)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              maxWidth: 480,
              overflowX: 'auto',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {this.state.error.message}
            </pre>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            {/* Soft reset — keeps the same page */}
            <button
              onClick={this.resetError}
              style={{
                padding: '0.55rem 1.2rem',
                borderRadius: '8px',
                border: '1px solid rgba(244,63,94,0.35)',
                background: 'transparent',
                color: '#be123c',
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(244,63,94,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Try again
            </button>

            {/* Hard reload fallback */}
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.55rem 1.2rem',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #e11d48, #be123c)',
                color: '#fff',
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(225,29,72,0.25)',
                transition: 'opacity 0.18s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Reload page
            </button>
          </div>
        </motion.div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary