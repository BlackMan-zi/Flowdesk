import client from './client'

export const getInitiatorDashboard = () => client.get('/dashboard/initiator')
export const getApproverDashboard = () => client.get('/dashboard/approver')
export const getAdminDashboard = (params) => client.get('/dashboard/admin', { params })
export const getReportManagerDashboard = () => client.get('/dashboard/report-manager')
export const getAuditLogs = (params) => client.get('/dashboard/logs', { params })
