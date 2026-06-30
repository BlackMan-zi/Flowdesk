import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { setupMfa, enableMfa, getMe } from '../api/auth'
import { toast } from 'sonner'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { Alert, AlertDescription } from '../components/ui/alert'
import { ShieldCheck, ShieldOff, AlertCircle, Settings as SettingsIcon } from 'lucide-react'

export default function Settings() {
  const { user, updateUser } = useAuth()
  const [setup, setSetup] = useState(null)      // { qr_code_url, secret }
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [enabled, setEnabled] = useState(!!user?.mfa_enabled)

  const startSetup = async () => {
    setError('')
    setLoading(true)
    try {
      const { data } = await setupMfa()
      setSetup(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not start MFA setup.')
    } finally {
      setLoading(false)
    }
  }

  const confirmEnable = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await enableMfa({ totp_code: code.trim() })
      // Refresh the cached user so the rest of the app sees MFA on.
      try {
        const me = await getMe()
        updateUser({ ...user, ...me.data })
      } catch { updateUser({ ...user, mfa_enabled: true }) }
      setEnabled(true)
      setSetup(null)
      setCode('')
      toast.success('Two-factor authentication enabled.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid authenticator code.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <SettingsIcon size={20} className="text-muted-foreground" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your account security</p>
      </div>

      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                {enabled ? <ShieldCheck size={16} className="text-green-600" /> : <ShieldOff size={16} className="text-muted-foreground" />}
                Two-factor authentication
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Add a 6-digit code from an authenticator app (Microsoft / Google Authenticator) to your sign-in.
              </p>
            </div>
            <span className={`text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap ${
              enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-muted text-muted-foreground'}`}>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          {enabled ? (
            <Alert variant="success">
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Two-factor authentication is on. You'll be asked for a code each time you sign in.
                Lost your device? Ask an administrator to reset your account.
              </AlertDescription>
            </Alert>
          ) : !setup ? (
            <Button onClick={startSetup} loading={loading}>
              <ShieldCheck size={15} /> Set up two-factor authentication
            </Button>
          ) : (
            <form onSubmit={confirmEnable} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-5 items-start">
                <div className="shrink-0">
                  <img src={setup.qr_code_url} alt="MFA QR code"
                    className="w-44 h-44 border border-border rounded-lg bg-white p-2" />
                </div>
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-foreground">1. Scan the QR code</p>
                  <p className="text-muted-foreground">Open your authenticator app → add account → scan.</p>
                  <p className="font-medium text-foreground pt-1">Can't scan? Enter this key:</p>
                  <code className="block font-mono text-xs bg-muted rounded px-2 py-1 break-all select-all">
                    {setup.secret}
                  </code>
                </div>
              </div>

              <Input
                label="2. Enter the 6-digit code to confirm"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
              />

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button type="submit" loading={loading} disabled={code.length < 6}>
                  Verify & Enable
                </Button>
                <Button type="button" variant="outline" onClick={() => { setSetup(null); setCode(''); setError('') }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {!enabled && !setup && error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </Card>
    </div>
  )
}
