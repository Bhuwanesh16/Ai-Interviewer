import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const registerUser = (payload) => apiClient.post('/auth/register', payload)

export const loginUser = (payload) => apiClient.post('/auth/login', payload)

export const generateQuestions = (payload) => apiClient.post('/interview/generate_questions', payload)

export const startInterview = (payload) => apiClient.post('/interview/start', payload)

export const submitInterview = (formData) =>
  apiClient.post('/interview/submit', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const analyzeChunk = (formData) =>
  apiClient.post('/interview/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const fetchResult = (sessionId) =>
  apiClient.get(`/interview/result/${sessionId}`)

export const fetchHistory = () =>
  apiClient.get('/interview/history')

