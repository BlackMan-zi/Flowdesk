import client from './client'

export const listFormDefinitions = () => client.get('/forms/definitions')
export const getFormDefinition = (id) => client.get(`/forms/definitions/${id}`)
export const createFormDefinition = (data) => client.post('/forms/definitions', data)
export const updateFormDefinition = (id, data) => client.patch(`/forms/definitions/${id}`, data)
export const deleteFormDefinition = (id) => client.delete(`/forms/definitions/${id}`)

// Accepts either a bare status string (legacy callers) or an options object:
//   { status, scope: 'mine'|'org', dateFrom, dateTo, search }
// The bare-string form is kept for backwards compatibility with callers that
// only pass a status filter.
export const listFormInstances = (statusOrOpts) => {
  const opts = typeof statusOrOpts === 'string' || statusOrOpts == null
    ? { status: statusOrOpts }
    : statusOrOpts
  const params = {}
  if (opts.status)   params.status    = opts.status
  if (opts.scope)    params.scope     = opts.scope
  if (opts.dateFrom) params.date_from = opts.dateFrom
  if (opts.dateTo)   params.date_to   = opts.dateTo
  if (opts.search)   params.search    = opts.search
  return client.get('/forms/instances', { params })
}
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

// Auth-gated download — fetch as blob, open in a new tab via object URL.
export const downloadAttachment = async (attachmentId, originalFilename) => {
  const res = await client.get(`/forms/attachments/${attachmentId}`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = originalFilename || 'attachment'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Auth-gated blob URL fetch for inline preview (img src / embed src).
// Caller is responsible for revoking the URL when done.
export const fetchAttachmentBlobUrl = async (attachmentId) => {
  const res = await client.get(`/forms/attachments/${attachmentId}`, { responseType: 'blob' })
  return URL.createObjectURL(res.data)
}

// Download the merged PDF (form + approval history + inlined attachments).
// Gated server-side to Approved/Completed status.
export const downloadFormPdf = async (instanceId, referenceNumber) => {
  const res = await client.get(`/forms/instances/${instanceId}/pdf`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `${referenceNumber || instanceId}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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
