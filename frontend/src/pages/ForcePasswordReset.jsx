import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { forceResetPassword, getMe } from '../api/auth'
import { KeyRound, Lock, AlertCircle, CheckCircle2, Workflow } from 'lucide-react'
import { Button } from '../components/ui/Button'
import Input from '../components/ui/Input'
import { Alert, AlertDescription } from '../components/ui/alert'
import { cn } from '@/lib/utils'

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

  const requirements = [
    { label: 'At least 8 characters', met: form.new_password.length >= 8 },
    { label: 'Passwords match',       met: form.new_password.length > 0 && form.new_password === form.confirm },
  ]

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">

        {/* Header */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center shadow-sm">
            <Workflow size={16} className="text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">FlowDesk</span>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-500 rounded-2xl shadow-lg mb-4">
            <KeyRound size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Set Your Password</h1>
          <p className="text-muted-foreground mt-1.5 text-sm max-w-xs mx-auto">
            Your account uses a temporary password. Please set a new one before continuing.
          </p>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Temporary Password"
              type="password"
              placeholder="Enter your temporary password"
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
              placeholder="Repeat your new password"
              value={form.confirm}
              onChange={set('confirm')}
              required
            />

            {/* Requirements checklist */}
            {(form.new_password || form.confirm) && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 border border-border">
                {requirements.map(req => (
                  <div key={req.label} className="flex items-center gap-2">
                    <CheckCircle2
                      size={13}
                      className={req.met ? 'text-emerald-500' : 'text-muted-foreground/40'}
                    />
                    <span className={cn('text-xs font-medium', req.met ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
                      {req.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" loading={loading} className="w-full mt-2">
              <Lock size={15} /> Update Password
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
