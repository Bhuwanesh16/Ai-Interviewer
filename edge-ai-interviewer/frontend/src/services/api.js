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
export const generateQuestions = ({ role, skills, level, numQuestions }) =>
  fetch(`${API_BASE}/interview/generate_questions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      role,
      skills,
      experience_level: level,
      question_volume:  numQuestions,
    }),
  }).then(async res => {
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Generate failed')
    return { data }
  })

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