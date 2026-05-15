import client from './client'

export const getMyOrganization = () => client.get('/settings/organization')
export const updateMyOrganization = (data) => client.patch('/settings/organization', data)

export const uploadHeaderImage = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return client.post('/settings/organization/header', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const uploadFooterImage = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return client.post('/settings/organization/footer', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const deleteHeaderImage = () => client.delete('/settings/organization/header')
export const deleteFooterImage = () => client.delete('/settings/organization/footer')

// Image endpoints are auth-gated, so fetch as blob and return an object URL.
// Callers are responsible for revoking the URL when done.
export const fetchHeaderImageObjectUrl = async () => {
  const res = await client.get('/settings/organization/header', { responseType: 'blob' })
  return URL.createObjectURL(res.data)
}

export const fetchFooterImageObjectUrl = async () => {
  const res = await client.get('/settings/organization/footer', { responseType: 'blob' })
  return URL.createObjectURL(res.data)
}
