import axios from 'axios'

// Detect subpath: on the server, FlowDesk lives at /flowdesk
// In local dev, it lives at root. This auto-detects which.
const SUBPATH = window.location.pathname.startsWith('/flowdesk') ? '/flowdesk' : ''

const client = axios.create({ baseURL: SUBPATH + '/api' })

client.interceptors.request.use(cfg => {
  // Don't clobber an explicitly-set Authorization header — the MFA
  // enrollment/verification calls authenticate with a short-lived
  // mfa_pending token, not the normal session token.
  if (!cfg.headers.Authorization) {
    const token = localStorage.getItem('fd_token')
    if (token) cfg.headers.Authorization = `Bearer ${token}`
  }
  return cfg
})

client.interceptors.response.use(
  res => res,
  err => {
    // A 401 from the login request itself is a wrong-password/unknown-email
    // rejection, not an expired session — hard-redirecting here would wipe
    // Login.jsx's in-progress form state before its own catch block can
    // show the inline error. Same rationale as the MFA endpoints returning
    // 400 instead of 401 for a bad code.
    const isLoginRequest = err.config?.url?.includes('/auth/login')
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('fd_token')
      localStorage.removeItem('fd_user')
      window.location.href = SUBPATH + '/login'
    }
    return Promise.reject(err)
  }
)

export { SUBPATH }
export default client
