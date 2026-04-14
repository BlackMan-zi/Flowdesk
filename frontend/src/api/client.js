import axios from 'axios'

const client = axios.create({ baseURL: '/api' })

client.interceptors.request.use(cfg => {
  const token = localStorage.getItem('fd_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('fd_token')
      localStorage.removeItem('fd_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
