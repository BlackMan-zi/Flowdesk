import React, { useState, useEffect } from 'react'
import { setupMfa, enableMfa, verifyMfaLogin } from '../../api/auth'
import { ShieldCheck, AlertCircle, ArrowLeft } from 'lucide-react'
import { Button } from '../ui/Button'
import Input from '../ui/Input'
import { Alert, AlertDescription } from '../ui/alert'

export default function MfaChallenge({ mfaPendingToken, mfaEnrolled, onSuccess, onBack }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [qr, setQr] = useState(null)
  const [qrLoading, setQrLoading] = useState(!mfaEnrolled)

  useEffect(() => {
    if (mfaEnrolled) return
    let cancelled = false
    setupMfa(mfaPendingToken)
      .then(({ data }) => { if (!cancelled) setQr(data) })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.detail || 'Could not start MFA setup.') })
      .finally(() => { if (!cancelled) setQrLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = mfaEnrolled
        ? await verifyMfaLogin(mfaPendingToken, code)
        : await enableMfa(mfaPendingToken, code)
      onSuccess(data.access_token, data.must_reset_password)
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid verification code.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-primary rounded-2xl shadow-lg mb-4">
          <ShieldCheck size={24} className="text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {mfaEnrolled ? 'Enter your code' : 'Set up two-factor authentication'}
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm max-w-xs mx-auto">
          {mfaEnrolled
            ? 'Open your authenticator app and enter the 6-digit code.'
            : 'Scan the QR code with an authenticator app, then enter the code it shows.'}
        </p>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm p-7">
        {!mfaEnrolled && (
          <div className="mb-5 text-center">
            {qrLoading ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                Generating QR code…
              </div>
            ) : qr ? (
              <>
                <img
                  src={qr.qr_code_url}
                  alt="Scan with your authenticator app"
                  className="mx-auto h-40 w-40 rounded-lg border border-border"
                />
                <p className="text-xs text-muted-foreground mt-3">
                  Can't scan? Enter this key manually:
                  <br />
                  <span className="font-mono text-foreground">{qr.secret}</span>
                </p>
              </>
            ) : null}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            autoFocus
          />

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" loading={loading} disabled={code.length !== 6} className="w-full mt-2">
            Verify &amp; Sign In
          </Button>
        </form>
      </div>

      <p className="text-center text-sm text-muted-foreground mt-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft size={13} /> Back to sign in
        </button>
      </p>
    </>
  )
}
