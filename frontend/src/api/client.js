import axios from 'axios'

// In Docker, VITE_BASE_PATH=/flowdesk/ so API calls go to /flowdesk/api.
// In local Vite dev, VITE_BASE_PATH=/ so API calls go to /api (proxied to :9000).
const base = (import.meta.env.VITE_BASE_PATH || '/').replace(/\/$/, '')
const client = axios.create({ baseURL: `${base}/api` })

client.interceptors.request.use(cfg => {
  const token = localStorage.getItem('fd_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('fd_token')
      localStorage.removeItem('fd_user')
      window.location.href = `${base}/login`
    }
    return Promise.reject(err)
  }
)

export default client
