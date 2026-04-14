import client from './client'

export const getPendingApprovals = () => client.get('/approvals/pending')
export const getApprovalHistory = (params = {}) => client.get('/approvals/history', { params })
export const approveForm = (formInstanceId, data) => client.post(`/approvals/${formInstanceId}/approve`, data)
export const rejectForm = (formInstanceId, data) => client.post(`/approvals/${formInstanceId}/reject`, data)
export const sendBackForm = (formInstanceId, data) => client.post(`/approvals/${formInstanceId}/send-back`, data)
export const adminCancelForm = (formInstanceId, data) => client.post(`/approvals/${formInstanceId}/admin-cancel`, data)
export const adminSendBackForm = (formInstanceId, data) => client.post(`/approvals/${formInstanceId}/admin-send-back`, data)
export const reassignStep = (formInstanceId, data) => client.post(`/approvals/${formInstanceId}/reassign-step`, data)
