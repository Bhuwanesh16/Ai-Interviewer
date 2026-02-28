import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Register from './pages/Register'
import Interview from './pages/Interview'
import Result from './pages/Result'
import Navbar from './components/Navbar'

function App() {
  return (
    <Router>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#020409',
        color: '#f0f9ff',
      }}>
        <Navbar />
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/"                    element={<Home />} />
            <Route path="/register"            element={<Register />} />
            <Route path="/interview"           element={<Interview />} />
            <Route path="/result/:sessionId"   element={<Result />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer style={{
          borderTop: '1px solid rgba(56,189,248,0.05)',
          padding: '1.25rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.65rem',
            letterSpacing: '0.1em',
            color: '#1e293b',
          }}>
            InterviewAI · Edge-based · All processing local
          </span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.65rem',
            color: '#0f172a',
          }}>
            v1.0.0
          </span>
        </footer>
      </div>
    </Router>
  )
}

export default App