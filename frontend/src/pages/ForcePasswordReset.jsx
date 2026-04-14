import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { forceResetPassword, getMe } from '../api/auth'
import { KeyRound } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

export default function ForcePasswordReset() {
  const { updateUser } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.new_password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    if (form.new_password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      await forceResetPassword({ current_password: form.current_password, new_password: form.new_password })
      const { data } = await getMe()
      updateUser({ ...data, must_reset_password: false })
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-500 rounded-2xl shadow-lg mb-4">
            <KeyRound size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Set Your Password</h1>
          <p className="text-slate-500 mt-1">You must change your temporary password before continuing</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Temporary Password"
              type="password"
              placeholder="••••••••"
              value={form.current_password}
              onChange={set('current_password')}
              required
              autoFocus
            />
            <Input
              label="New Password"
              type="password"
              placeholder="At least 8 characters"
              value={form.new_password}
              onChange={set('new_password')}
              required
            />
            <Input
              label="Confirm New Password"
              type="password"
              placeholder="••••••••"
              value={form.confirm}
              onChange={set('confirm')}
              required
            />

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full">
              Update Password
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
