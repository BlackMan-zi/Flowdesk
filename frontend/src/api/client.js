import axios from 'axios'

// Detect subpath: on the server, FlowDesk lives at /flowdesk
// In local dev, it lives at root. This auto-detects which.
const SUBPATH = window.location.pathname.startsWith('/flowdesk') ? '/flowdesk' : ''

const client = axios.create({ baseURL: SUBPATH + '/api' })

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
      window.location.href = SUBPATH + '/login'
    }
    return Promise.reject(err)
  }
)

export { SUBPATH }
export default client
