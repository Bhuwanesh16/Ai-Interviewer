// services/api.js
import axios from 'axios'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '')

const getToken = () => localStorage.getItem('token') || ''

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
})

// axios instance used by parts of the app
const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

// attach token to requests
apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    if (status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (window.location.pathname !== '/register') {
        window.location.href = '/register'
      }
      return Promise.reject(new Error('Unauthorized: Invalid or expired token'))
    }
    return Promise.reject(error)
  }
)

export const registerUser = (payload) => apiClient.post('/auth/register', payload)

export const loginUser = ({ email, password }) =>
  fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(async res => {
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Login failed')
    return { data }
  })

export const logoutUser = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}

export const getCurrentUser = () =>
  fetch(`${API_BASE}/auth/me`, {
    headers: authHeaders(),
  }).then(async res => {
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Auth check failed')
    return { data }
  })

// ── Called by Interview.jsx → handleSetupSubmit ───────────────────────────────
const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

export const generateQuestions = async ({ role, skills, level, numQuestions }) => {
  const url = `${API_BASE}/interview/generate_questions`
  const bodyBase = {
    role,
    skills,
    experience_level: level,
    question_volume: numQuestions,
  }

  // 1) Try phi3, but cap at 15s. If it times out, immediately retry with fallback.
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(bodyBase),
    }, 15_000)

    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Generate failed')
    return { data }
  } catch (err) {
    const isTimeout = err?.name === 'AbortError' || /aborted|timeout/i.test(String(err?.message || ''))
    if (!isTimeout) throw err

    const res2 = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...bodyBase, force_fallback: true }),
    })
    const data2 = await res2.json()
    if (!res2.ok) throw new Error(data2.message || 'Generate failed')
    return { data: data2 }
  }
}

// ── Called by Interview.jsx → ensureSession ───────────────────────────────────
export const startInterview = ({ position, experience_level }) =>
  fetch(`${API_BASE}/interview/start`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ role: position, experience_level }),
  }).then(async res => {
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Start failed')
    return { data }
  })

// ── Called by Interview.jsx → recorder.onstop ────────────────────────────────
export const submitInterview = (formData) =>
  fetch(`${API_BASE}/interview/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  }).then(async res => {
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Submit failed')
    return { data }
  })

// ── Follow-up question (professional interviewer flow) ────────────────────────
export const generateFollowup = ({ role, level, question, transcript }) =>
  fetch(`${API_BASE}/interview/generate_followup`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ role, level, question, transcript }),
  }).then(async res => {
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Follow-up failed')
    return { data }
  })

// ── History ───────────────────────────────────────────────────────────────────
export const fetchHistory = () =>
  fetch(`${API_BASE}/interview/history`, {
    headers: authHeaders(),
  }).then(async res => {
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'History failed')
    return { data }
  })

// ── Result ────────────────────────────────────────────────────────────────────
export const fetchResult = (sessionId) =>
  fetch(`${API_BASE}/result/${sessionId}`, {
    headers: authHeaders(),
  }).then(async res => {
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Result failed')
    return { data }
  })