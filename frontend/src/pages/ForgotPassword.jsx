import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../api/auth'
import { Workflow, Mail, ArrowRight, ArrowLeft, AlertCircle, MailCheck } from 'lucide-react'
import { Button } from '../components/ui/Button'
import Input from '../components/ui/Input'
import { Alert, AlertDescription } from '../components/ui/alert'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await forgotPassword({ email })
      // Backend always returns the same generic response whether or not the
      // account exists, so the UI shows one success state regardless.
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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

        {sent ? (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-500 rounded-2xl shadow-lg mb-4">
                <MailCheck size={24} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Check your email</h1>
              <p className="text-muted-foreground mt-1.5 text-sm max-w-sm mx-auto">
                If an account exists for <span className="font-medium text-foreground">{email}</span>, we've
                sent a temporary password to sign in with. You'll be asked to choose a new password right after.
              </p>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm p-7 text-center space-y-4">
              <Link to="/login">
                <Button className="w-full">Go to sign in</Button>
              </Link>
              <p className="text-sm text-muted-foreground">
                Didn't get it? Check your spam folder, or try again with a different address.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
                Try a different email
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground">Forgot your password?</h1>
              <p className="text-muted-foreground mt-1.5 text-sm max-w-xs mx-auto">
                Enter your work email and we'll send you a temporary password to sign in with.
              </p>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm p-7">
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Work email"
                  type="email"
                  placeholder="you@bsc.rw"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                />

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" loading={loading} className="w-full mt-2">
                  Send temporary password
                  <ArrowRight size={16} />
                </Button>
              </form>
            </div>
          </>
        )}

        <p className="text-center text-sm text-muted-foreground mt-6">
          <Link to="/login" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft size={13} /> Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
