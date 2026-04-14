import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { login, getMe } from '../api/auth'
import { Workflow } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

export default function Login() {
  const { login: authLogin } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ org_subdomain: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await login(form)
      if (data.mfa_required) {
        setError('MFA is required. Contact your admin to log in.')
        return
      }
      if (!data.access_token) {
        setError('Login failed. No token received.')
        return
      }
      const meRes = await (async () => {
        localStorage.setItem('fd_token', data.access_token)
        return getMe()
      })()
      authLogin(data.access_token, { ...meRes.data, must_reset_password: data.must_reset_password })
      if (data.must_reset_password) {
        navigate('/force-reset-password')
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl shadow-lg mb-4">
            <Workflow size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome to FlowDesk</h1>
          <p className="text-slate-500 mt-1">Sign in to your workspace</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Organisation"
              placeholder="your-company"
              value={form.org_subdomain}
              onChange={set('org_subdomain')}
              required
              autoFocus
            />
            <Input
              label="Email"
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={set('email')}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={set('password')}
              required
            />

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full mt-2">
              Sign In
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
