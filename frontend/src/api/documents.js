import client from './client'

export const listDocuments = () => client.get('/documents')
export const downloadDocument = (formInstanceId) =>
  client.get(`/documents/${formInstanceId}/download`, { responseType: 'blob' })
