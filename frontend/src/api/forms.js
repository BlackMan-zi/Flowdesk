import client from './client'

export const listFormDefinitions = () => client.get('/forms/definitions')
export const getFormDefinition = (id) => client.get(`/forms/definitions/${id}`)
export const createFormDefinition = (data) => client.post('/forms/definitions', data)
export const updateFormDefinition = (id, data) => client.patch(`/forms/definitions/${id}`, data)
export const deleteFormDefinition = (id) => client.delete(`/forms/definitions/${id}`)

export const listFormInstances = (status) =>
  client.get('/forms/instances', { params: status ? { status } : {} })
export const getFormInstance = (id) => client.get(`/forms/instances/${id}`)
export const createFormInstance = (data) => client.post('/forms/instances', data)
export const saveDraft = (id, data) => client.patch(`/forms/instances/${id}/draft`, data)
export const submitFormInstance = (id, data) => client.post(`/forms/instances/${id}/submit`, data)
export const resubmitFormInstance = (id, data) => client.post(`/forms/instances/${id}/resubmit`, data)
export const uploadAttachment = (id, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return client.post(`/forms/instances/${id}/attachments`, fd)
}

// PDF template endpoints
export const uploadPdfTemplate = (formDefId, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return client.post(`/forms/definitions/${formDefId}/pdf-template`, fd)
}
export const getPdfTemplateBlob = (formDefId) =>
  client.get(`/forms/definitions/${formDefId}/pdf-template`, { responseType: 'blob' })

// Per-page template endpoints (page_num >= 1)
export const uploadPdfTemplatePage = (formDefId, pageNum, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return client.post(`/forms/definitions/${formDefId}/pdf-template/page/${pageNum}`, fd)
}
export const getPdfTemplateBlobPage = (formDefId, pageNum) =>
  client.get(`/forms/definitions/${formDefId}/pdf-template/page/${pageNum}`, { responseType: 'blob' })
export const replaceFormFields = (formDefId, fields) =>
  client.put(`/forms/definitions/${formDefId}/fields`, { fields })

export const listApprovalTemplates = () => client.get('/approval-templates')
export const getApprovalTemplate = (id) => client.get(`/approval-templates/${id}`)
export const createApprovalTemplate = (data) => client.post('/approval-templates', data)
export const updateApprovalTemplate = (id, data) => client.patch(`/approval-templates/${id}`, data)
export const deleteApprovalTemplate = (id) => client.delete(`/approval-templates/${id}`)
