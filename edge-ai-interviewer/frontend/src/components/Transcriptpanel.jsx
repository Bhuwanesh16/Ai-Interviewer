/**
 * TranscriptPanel.jsx
 *
 * Displays the transcript section of the results page.
 * When transcription has failed it shows:
 *   - A clear human-readable explanation of what went wrong
 *   - Ordered install steps with copy-able commands
 *   - A status indicator pulled from /api/asr_status
 *
 * Replace the inline transcript <div> in your ResultPage / SessionFeedback
 * component with <TranscriptPanel transcript={transcript} />.
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Failure detection ─────────────────────────────────────────────────────────

const FAILURE_MARKERS = [
  'Transcription unavailable',
  '(Audio file missing',
  '(Speech parsing error',
  'openai-whisper not installed',
  'openai-whisper is not installed',
  'No local or online ASR backends',
]

const isFailedTranscript = (t) =>
  !t || FAILURE_MARKERS.some((m) => t.includes(m))

const detectMissingDeps = (t = '') => ({
  missingFfmpeg: t.includes('ffmpeg') || t.includes('FFMPEG'),
  missingWhisper: t.includes('openai-whisper') || t.includes('whisper'),
})

// ── Copy button ───────────────────────────────────────────────────────────────

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      title="Copy to clipboard"
      style={{
        marginLeft: '0.5rem',
        padding: '0.15rem 0.5rem',
        borderRadius: '6px',
        border: '1px solid rgba(148,163,184,0.3)',
        background: copied ? 'rgba(5,150,105,0.1)' : 'rgba(248,250,252,0.8)',
        color: copied ? '#059669' : '#64748b',
        fontSize: '0.65rem',
        fontFamily: "'JetBrains Mono', monospace",
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {copied ? '✓ copied' : 'copy'}
    </button>
  )
}

// ── Step row ──────────────────────────────────────────────────────────────────

const Step = ({ n, label, command, note }) => (
  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
    <div style={{
      flexShrink: 0,
      width: 22, height: 22,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
      color: '#fff',
      fontSize: '0.65rem',
      fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono', monospace",
    }}>{n}</div>
    <div style={{ flex: 1 }}>
      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
        {label}
      </p>
      {command && (
        <div style={{
          display: 'flex', alignItems: 'center',
          background: '#0f172a',
          borderRadius: '8px',
          padding: '0.4rem 0.75rem',
          marginBottom: note ? '0.25rem' : 0,
        }}>
          <code style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.72rem',
            color: '#7dd3fc',
            flex: 1,
            userSelect: 'all',
          }}>{command}</code>
          <CopyButton text={command} />
        </div>
      )}
      {note && (
        <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>{note}</p>
      )}
    </div>
  </div>
)

// ── ASR status badge ─────────────────────────────────────────────────────────

const AsrStatusBadge = () => {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/asr_status`)
      .then((r) => r.json())
      .then((d) => setStatus(d.asr))
      .catch(() => setStatus(null))
  }, [])

  if (!status) return null

  const allOk = status.whisper_loaded && status.ffmpeg

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
      padding: '0.3rem 0.75rem',
      borderRadius: '99px',
      border: `1px solid ${allOk ? 'rgba(5,150,105,0.3)' : 'rgba(239,68,68,0.3)'}`,
      background: allOk ? 'rgba(5,150,105,0.06)' : 'rgba(239,68,68,0.06)',
      fontSize: '0.65rem',
      fontFamily: "'JetBrains Mono', monospace",
      color: allOk ? '#059669' : '#ef4444',
      marginBottom: '1rem',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: allOk ? '#059669' : '#ef4444',
        display: 'inline-block',
      }} />
      {allOk
        ? 'ASR backend ready'
        : (status.recommended_action || 'ASR backend not ready')}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const TranscriptPanel = ({ transcript }) => {
  const [expanded, setExpanded] = useState(false)
  const failed = isFailedTranscript(transcript)
  const { missingFfmpeg, missingWhisper } = detectMissingDeps(transcript)

  if (!failed) {
    // Normal successful transcript
    return (
      <div style={{
        borderRadius: '1.25rem',
        border: '1px solid rgba(148,163,184,0.2)',
        background: 'rgba(248,250,252,0.9)',
        padding: '1.25rem 1.5rem',
      }}>
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.6rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#0ea5e9',
          marginBottom: '0.75rem',
        }}>Full Transcript</p>
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.9rem',
          lineHeight: 1.7,
          color: '#334155',
          whiteSpace: 'pre-wrap',
        }}>{transcript}</p>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      borderRadius: '1.25rem',
      border: '1px solid rgba(239,68,68,0.2)',
      background: 'rgba(255,255,255,0.98)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem',
        background: 'rgba(254,242,242,0.6)',
        borderBottom: '1px solid rgba(239,68,68,0.12)',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(239,68,68,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1rem', flexShrink: 0,
        }}>⚠️</div>
        <div>
          <p style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 700,
            fontSize: '0.9rem',
            color: '#0f172a',
            marginBottom: '0.1rem',
          }}>Transcription Unavailable</p>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.75rem',
            color: '#64748b',
          }}>
            {missingFfmpeg && missingWhisper
              ? 'ffmpeg and openai-whisper are both missing from this environment.'
              : missingFfmpeg
              ? 'ffmpeg is not installed — audio cannot be converted for processing.'
              : missingWhisper
              ? 'openai-whisper is not installed — no local ASR backend is available.'
              : 'No ASR backend could process the audio. Follow the steps below.'}
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '1.25rem 1.5rem' }}>
        <AsrStatusBadge />

        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.8rem',
          fontWeight: 600,
          color: '#1e293b',
          marginBottom: '1rem',
        }}>Fix in 3 steps — then restart your backend</p>

        {/* Step 1: ffmpeg */}
        {missingFfmpeg && (
          <Step
            n={1}
            label="Install ffmpeg (system dependency)"
            command={
              navigator.platform?.includes('Win')
                ? 'winget install ffmpeg'
                : navigator.platform?.includes('Mac') || /Mac/.test(navigator.userAgent)
                ? 'brew install ffmpeg'
                : 'sudo apt-get install -y ffmpeg'
            }
            note="Or download from ffmpeg.org/download.html and add to PATH"
          />
        )}

        {/* Step 2: Whisper */}
        {missingWhisper && (
          <Step
            n={missingFfmpeg ? 2 : 1}
            label="Install openai-whisper and its dependencies"
            command="pip install openai-whisper"
            note="This also downloads PyTorch if not already installed (~2 GB)"
          />
        )}

        {/* Step 3: Pre-download model */}
        <Step
          n={missingFfmpeg && missingWhisper ? 3 : missingFfmpeg || missingWhisper ? 2 : 1}
          label="Pre-download the Whisper tiny.en model (~75 MB)"
          command={'python -c "import whisper; whisper.load_model(\'tiny.en\')"'}
          note="Run once — model is cached locally for all future sessions"
        />

        {/* One-shot script option */}
        <div style={{
          marginTop: '0.5rem',
          padding: '0.875rem 1rem',
          borderRadius: '10px',
          background: 'rgba(14,165,233,0.04)',
          border: '1px solid rgba(14,165,233,0.15)',
        }}>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#0369a1',
            marginBottom: '0.4rem',
          }}>Or run the automated setup script (recommended)</p>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: '#0f172a',
            borderRadius: '8px',
            padding: '0.4rem 0.75rem',
          }}>
            <code style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.72rem',
              color: '#7dd3fc',
              flex: 1,
            }}>python setup_asr.py</code>
            <CopyButton text="python setup_asr.py" />
          </div>
          <p style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.35rem' }}>
            Detects your OS, installs ffmpeg + whisper, pre-downloads the model, and verifies everything.
          </p>
        </div>

        {/* Expand to see raw error */}
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: '1rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.62rem',
            letterSpacing: '0.08em',
            color: '#94a3b8',
            padding: 0,
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
          }}
        >
          {expanded ? '▲ Hide raw error' : '▼ Show raw error'}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.pre
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                borderRadius: '8px',
                background: '#0f172a',
                color: '#94a3b8',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.65rem',
                lineHeight: 1.6,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {transcript}
            </motion.pre>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default TranscriptPanel