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

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('API Error:', error.response.data);

      // Handle session expiration
      if (error.response.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/register';
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Network Error: No response received');
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Request Error:', error.message);
    }
    return Promise.reject(error);
  }
)

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

export const generateFollowup = (payload) => apiClient.post('/interview/generate_followup', payload)

export const fetchHistory = () =>
  apiClient.get('/interview/history')

