import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { login, getMe } from '../api/auth'
import { Workflow, Mail, Lock, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { cn } from '@/lib/utils'

const FEATURES = [
  'Multi-level approval chains',
  'PDF form generation & e-signing',
  'Role-based access control',
  'Real-time status tracking',
]

function IconInput({ icon: Icon, label, error, className, ...props }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-foreground">
          {label}
          {props.required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          {...props}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-4 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive focus-visible:ring-destructive'
          )}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export default function Login() {
  const { login: authLogin } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
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
      localStorage.setItem('fd_token', data.access_token)
      const meRes = await getMe()
      authLogin(data.access_token, { ...meRes.data, must_reset_password: data.must_reset_password })
      navigate(data.must_reset_password ? '/force-reset-password' : '/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[440px] flex-shrink-0 bg-sidebar text-sidebar-foreground p-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-sidebar-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-sidebar-primary/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3 pointer-events-none" />

        {/* Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 bg-sidebar-primary rounded-xl flex items-center justify-center shadow-lg">
            <Workflow size={20} className="text-sidebar-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight">FlowDesk</span>
        </div>

        {/* Tagline */}
        <div className="relative z-10">
          <h2 className="text-3xl font-bold leading-tight">
            Streamline your<br />approval workflows
          </h2>
          <p className="mt-4 text-sidebar-foreground/60 text-sm leading-relaxed">
            A modern platform for managing form submissions, multi-step approvals, and document workflows — all in one place.
          </p>
          <div className="mt-8 space-y-3">
            {FEATURES.map(f => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-sidebar-primary/30 flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={12} className="text-sidebar-primary" />
                </div>
                <span className="text-sm text-sidebar-foreground/70">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-sidebar-foreground/30 relative z-10">
          © {new Date().getFullYear()} FlowDesk. All rights reserved.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-slide-up">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg">
              <Workflow size={20} className="text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">FlowDesk</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Sign in with your work email — your organisation is detected automatically.
            </p>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-sm p-7">
            <form onSubmit={handleSubmit} className="space-y-4">
              <IconInput
                icon={Mail}
                label="Work email"
                type="email"
                placeholder="you@bsc.rw"
                value={form.email}
                onChange={set('email')}
                required
                autoFocus
                autoComplete="email"
              />
              <IconInput
                icon={Lock}
                label="Password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={set('password')}
                required
                autoComplete="current-password"
              />

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                loading={loading}
                className="w-full mt-2"
                size="default"
              >
                Sign In
                <ArrowRight size={16} />
              </Button>
            </form>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Having trouble? Contact your system administrator.
          </p>
        </div>
      </div>
    </div>
  )
}
