import client from './client'

export const login = (data) => client.post('/auth/login', data)
export const getMe = () => client.get('/auth/me')
export const forceResetPassword = (data) => client.post('/auth/force-reset-password', data)
export const forgotPassword = (data) => client.post('/auth/forgot-password', data)
export const resetPassword = (data) => client.post('/auth/reset-password', data)
export const setupMfa = () => client.post('/auth/mfa/setup')
export const enableMfa = (data) => client.post('/auth/mfa/enable', data)
