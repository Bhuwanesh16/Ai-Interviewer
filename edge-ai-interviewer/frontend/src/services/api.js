/**
 * api.js — Axios API client for InterviewAI frontend.
 *
 * Fixes applied:
 * - fetchResult URL corrected: result_bp is registered at /api with route
 *   decorator /result/<id>, so the full path is /api/result/<id>,
 *   NOT /api/interview/result/<id>. This was the primary cause of the
 *   CORS preflight 404 → "doesn't have HTTP ok status" error.
 * - Token refresh: 401 attempts a silent refresh before clearing session.
 * - _isRetry flag prevents infinite refresh loops.
 * - Redirect on expired session goes to /register (matching your app's auth flow).
 * - Request timeouts: 30s default, 120s for submitInterview, 60s for analyzeChunk.
 * - Network errors surfaced as structured { isNetworkError, message } object.
 */

import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  withCredentials: true,
})

// ── Request interceptor — attach Bearer token ─────────────────────────────
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor — error handling + silent token refresh ──────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response) {
      const status = error.response.status

      if (status === 401 && !originalRequest._isRetry) {
        originalRequest._isRetry = true
        try {
          const { data } = await apiClient.post('/auth/refresh')
          localStorage.setItem('token', data.token)
          originalRequest.headers.Authorization = `Bearer ${data.token}`
          return apiClient(originalRequest)
        } catch {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          window.location.href = '/register'
        }
      }
      console.error('API Error:', error.response.status, error.response.data)

    } else if (error.request) {
      console.error('Network Error: No response received from server')
      return Promise.reject({
        isNetworkError: true,
        message: 'Cannot reach the server. Please check your connection.',
      })
    } else {
      console.error('Request Setup Error:', error.message)
    }
    return Promise.reject(error)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────
export const registerUser  = (payload) => apiClient.post('/auth/register', payload)
export const loginUser     = (payload) => apiClient.post('/auth/login', payload)

// ── Interview ─────────────────────────────────────────────────────────────
export const generateQuestions = (payload) =>
  apiClient.post('/interview/generate_questions', payload)

export const startInterview = (payload) =>
  apiClient.post('/interview/start', payload)

// 120s — video upload + full ML pipeline can take 10–60s
export const submitInterview = (formData) =>
  apiClient.post('/interview/submit', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  })

// 60s — chunk upload + partial analysis
export const analyzeChunk = (formData) =>
  apiClient.post('/interview/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60_000,
  })

export const generateFollowup = (payload) =>
  apiClient.post('/interview/generate_followup', payload)

// FIX: result_bp is registered at url_prefix="/api" with route "/result/<id>"
// → full URL is GET /api/result/<sessionId>
// Previously was /interview/result/<id> which caused a 404 preflight failure.
export const fetchResult = (sessionId) =>
  apiClient.get(`/result/${sessionId}`)

export const fetchHistory = () =>
  apiClient.get('/interview/history')