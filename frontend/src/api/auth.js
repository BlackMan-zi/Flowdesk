import client from './client'

export const login = (data) => client.post('/auth/login', data)
export const getMe = () => client.get('/auth/me')
export const forceResetPassword = (data) => client.post('/auth/force-reset-password', data)
export const forgotPassword = (data) => client.post('/auth/forgot-password', data)

// Inline-login MFA only — these authenticate with the short-lived
// mfa_pending_token returned by login(), not the normal session token.
const withPending = (token) => ({ headers: { Authorization: `Bearer ${token}` } })
export const setupMfa = (pendingToken) => client.post('/auth/mfa/setup', {}, withPending(pendingToken))
export const enableMfa = (pendingToken, totp_code) => client.post('/auth/mfa/enable', { totp_code }, withPending(pendingToken))
export const verifyMfaLogin = (pendingToken, totp_code) => client.post('/auth/mfa/verify', { totp_code }, withPending(pendingToken))

// Called right after a successful MFA verification, before the real access
// token has been persisted to localStorage — so it's passed explicitly
// rather than relying on client.js's interceptor.
export const trustDevice = (accessToken) => client.post('/auth/mfa/trust-device', {}, withPending(accessToken))
