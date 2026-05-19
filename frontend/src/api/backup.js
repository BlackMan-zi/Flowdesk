import client from './client'

export const listBackups = () => client.get('/backup/list')

export const createBackup = () => client.post('/backup/create')

export const deleteBackup = (filename) =>
  client.delete(`/backup/${encodeURIComponent(filename)}`)

// Download as a blob and trigger a browser save dialog. Returning the blob
// here keeps the auth header on the request (a plain <a href> wouldn't).
export const downloadBackup = async (filename) => {
  const res = await client.get(`/backup/download/${encodeURIComponent(filename)}`, {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
