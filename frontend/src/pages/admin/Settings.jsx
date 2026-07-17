import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getMyOrganization, updateMyOrganization,
  uploadHeaderImage, uploadFooterImage,
  deleteHeaderImage, deleteFooterImage,
  fetchHeaderImageObjectUrl, fetchFooterImageObjectUrl,
} from '../../api/settings'
import {
  listBackups, createBackup, downloadBackup, deleteBackup,
} from '../../api/backup'
import { listUsersDirectory, adminResetPassword } from '../../api/users'
import { Card, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import { Alert } from '../../components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/Modal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs'
import { Switch } from '../../components/ui/switch'
import { cn, copyToClipboard } from '../../lib/utils'
import {
  Upload, Trash2, Image as ImageIcon, Building2, Palette, Shield, ShieldCheck,
  Plus, X, Save, AlertCircle, Check, Eye,
  Database, Download, RefreshCw, Clock, KeyRound, Copy,
} from 'lucide-react'
import LetterheadPage from '../../components/letterhead/LetterheadPage'
import SampleFormBody from '../../components/letterhead/SampleFormBody'

// ── Classification labels: defaults + suggested colors ────────────────────────

const DEFAULT_LABELS = [
  { name: 'Public',       color: '#22C55E' },
  { name: 'Internal',     color: '#EAB308' },
  { name: 'Confidential', color: '#EF4444' },
  { name: 'Restricted',   color: '#64748B' },
]

const SUGGESTED_COLORS = {
  public: '#22C55E',
  internal: '#EAB308',
  confidential: '#EF4444',
  secret: '#DC2626',
  restricted: '#64748B',
  private: '#A855F7',
  draft: '#94A3B8',
}

function suggestColor(name) {
  return SUGGESTED_COLORS[(name || '').trim().toLowerCase()] || '#64748B'
}

// Hex → rgb to compute "did the admin pick a near-white color we shouldn't use"
function tintedBg(hex) {
  if (!hex) return undefined
  return `${hex}1A`  // ~10% alpha
}

// ── Image upload card ─────────────────────────────────────────────────────────

function LetterheadImageCard({ kind, hasImage, onUpload, onDelete, fetchObjectUrl, accentColor }) {
  const fileRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let revokeUrl = null
    let cancelled = false
    if (hasImage) {
      fetchObjectUrl()
        .then(url => {
          if (cancelled) { URL.revokeObjectURL(url); return }
          revokeUrl = url
          setPreviewUrl(url)
        })
        .catch(() => setPreviewUrl(null))
    } else {
      setPreviewUrl(null)
    }
    return () => {
      cancelled = true
      if (revokeUrl) URL.revokeObjectURL(revokeUrl)
    }
  }, [hasImage, refreshKey, fetchObjectUrl])

  const handleFile = async (file) => {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image is larger than 8 MB.')
      return
    }
    setBusy(true)
    try {
      await onUpload(file)
      setRefreshKey(k => k + 1)
      toast.success(`${kind === 'header' ? 'Header' : 'Footer'} uploaded.`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    setBusy(true)
    try {
      await onDelete()
      setRefreshKey(k => k + 1)
      toast.success(`${kind === 'header' ? 'Header' : 'Footer'} removed.`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  const isHeader = kind === 'header'

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ImageIcon size={14} className="text-muted-foreground" />
              {isHeader ? 'Header (top of every form PDF)' : 'Footer (bottom of every form PDF)'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Any image format: PNG, JPG, WEBP, GIF, BMP, TIFF, ICO, AVIF. Max&nbsp;8&nbsp;MB.
              Wide aspect ratio recommended ({isHeader ? '~ 1600×200' : '~ 1600×100'}).
            </p>
          </div>
          {hasImage && (
            <Button size="sm" variant="ghost" onClick={handleDelete} disabled={busy}>
              <Trash2 size={13} className="mr-1" /> Remove
            </Button>
          )}
        </div>

        <div
          className={cn(
            'rounded-lg border-2 border-dashed border-border bg-muted/20 overflow-hidden',
            'flex items-center justify-center min-h-[120px]'
          )}
          style={accentColor ? { borderColor: `${accentColor}40` } : undefined}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`${kind} preview`}
              className="max-w-full max-h-[200px] object-contain"
            />
          ) : (
            <div className="text-center px-4 py-6">
              <ImageIcon size={20} className="text-muted-foreground/50 mx-auto" />
              <p className="text-xs text-muted-foreground mt-1.5">No {kind} uploaded yet.</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload size={13} className="mr-1.5" />
            {hasImage ? 'Replace' : 'Upload'}
          </Button>
          {busy && <span className="text-xs text-muted-foreground">Working…</span>}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Classification labels editor (color-aware) ────────────────────────────────

function LabelChip({ label, onColorChange, onRemove }) {
  const inputRef = useRef(null)
  const color = label.color || suggestColor(label.name)
  return (
    <span
      className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full border text-xs font-medium"
      style={{
        backgroundColor: tintedBg(color),
        borderColor: `${color}66`,
        color: color,
      }}
    >
      <button
        type="button"
        title="Change color"
        onClick={() => inputRef.current?.click()}
        className="w-4 h-4 rounded-full border border-white/40 ring-1 ring-black/5 cursor-pointer flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <input
        ref={inputRef}
        type="color"
        value={color}
        onChange={e => onColorChange(e.target.value.toUpperCase())}
        className="hidden"
      />
      <span>{label.name}</span>
      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        className="opacity-60 hover:opacity-100 transition-opacity"
        style={{ color }}
      >
        <X size={12} />
      </button>
    </span>
  )
}

function ClassificationLabelsEditor({ labels, onChange }) {
  const [draft, setDraft] = useState('')
  const list = labels && labels.length ? labels : DEFAULT_LABELS

  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (list.some(l => l.name.toLowerCase() === v.toLowerCase())) {
      toast.error('That label already exists.')
      return
    }
    onChange([...list, { name: v, color: suggestColor(v) }])
    setDraft('')
  }

  const remove = (name) => onChange(list.filter(l => l.name !== name))
  const setColor = (name, color) =>
    onChange(list.map(l => (l.name === name ? { ...l, color } : l)))
  const reset = () => onChange(DEFAULT_LABELS)

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield size={14} className="text-muted-foreground" />
            Document Classification Labels
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            These show up when an admin creates or edits a form. They pick which one applies. Click a label's color dot to change its color.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {list.map(label => (
            <LabelChip
              key={label.name}
              label={label}
              onColorChange={(c) => setColor(label.name, c)}
              onRemove={() => remove(label.name)}
            />
          ))}
          {!list.length && (
            <p className="text-xs text-muted-foreground italic">No labels. Forms will not show a classification field.</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="Add label e.g. Strictly Private"
            className="flex-1"
          />
          <Button size="sm" variant="outline" onClick={add}>
            <Plus size={13} className="mr-1" /> Add
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>Reset to defaults</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Database backup card ──────────────────────────────────────────────────────

function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function DatabaseBackupCard() {
  const qc = useQueryClient()

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ['db-backups'],
    queryFn: () => listBackups().then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: createBackup,
    onSuccess: () => {
      toast.success('Snapshot created.')
      qc.invalidateQueries({ queryKey: ['db-backups'] })
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || 'Snapshot failed.')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteBackup,
    onSuccess: () => {
      toast.success('Snapshot deleted.')
      qc.invalidateQueries({ queryKey: ['db-backups'] })
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || 'Delete failed.')
    },
  })

  const handleDownload = async (filename) => {
    try {
      await downloadBackup(filename)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Download failed.')
    }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Database size={14} className="text-muted-foreground" />
              Database Backup
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Take a full snapshot of the database as a single Excel workbook
              (one sheet per table). Snapshots also run automatically every day at <strong>00:00</strong>.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
          >
            <RefreshCw size={13} className={cn('mr-1.5', createMut.isPending && 'animate-spin')} />
            {createMut.isPending ? 'Snapshotting…' : 'Create snapshot'}
          </Button>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-1.5 w-fit">
          <Clock size={12} />
          Automatic nightly backup scheduled: runs every day at 00:00 server time.
        </div>

        {isLoading ? (
          <div className="h-16 bg-muted rounded animate-pulse" />
        ) : backups.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-4 text-center">
            No snapshots yet. Click "Create snapshot" or wait for tonight's automatic run.
          </p>
        ) : (
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Filename</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map(b => (
                  <tr key={b.filename} className="border-t border-border">
                    <td className="px-3 py-2 font-mono truncate max-w-[260px]">{b.filename}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatWhen(b.created_at)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatBytes(b.file_size)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownload(b.filename)}
                      >
                        <Download size={12} className="mr-1" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          if (confirm(`Delete snapshot "${b.filename}"? This cannot be undone.`)) {
                            deleteMut.mutate(b.filename)
                          }
                        }}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 size={12} className="mr-1" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── MFA policy card ────────────────────────────────────────────────────────────

function MfaPolicyCard({ requireMfaForAll, onRequireMfaForAllChange, reauthDays, onReauthDaysChange }) {
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck size={14} className="text-muted-foreground" />
            Multi-Factor Authentication Policy
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Organization-wide MFA rules. Individual per-user MFA requirements
            (set on the Users page) still apply on top of this.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 py-1">
          <div>
            <p className="text-sm font-medium text-foreground">Require MFA for everyone</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When on, every user in this organization must complete MFA at
              login, regardless of their individual setting.
            </p>
          </div>
          <Switch checked={requireMfaForAll} onCheckedChange={onRequireMfaForAllChange} />
        </div>

        <div className="pt-1">
          <label className="text-sm font-medium text-foreground">Days before MFA is asked again</label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            Once a user verifies their code, they won't be re-challenged for
            this many days. Leave blank to always ask, every login.
          </p>
          <Input
            type="number"
            min="0"
            value={reauthDays}
            onChange={e => onReauthDaysChange(e.target.value)}
            placeholder="Always ask"
            className="w-32"
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ── Reset user password card ──────────────────────────────────────────────────

function ResetUserPasswordCard() {
  const [userId, setUserId] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [result, setResult] = useState(null)

  const { data: users = [] } = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: () => listUsersDirectory().then(r => r.data),
  })

  const resetMut = useMutation({
    mutationFn: () => adminResetPassword(userId, { send_email: sendEmail }),
    onSuccess: (res) => {
      const u = users.find(x => x.id === userId)
      setResult({ ...res.data, userName: u?.name || 'this user' })
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Reset failed.'),
  })

  const copyPassword = async () => {
    try {
      await copyToClipboard(result.temp_password)
      toast.success('Copied to clipboard.')
    } catch {
      toast.error('Could not copy automatically — select and copy the password manually.')
    }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <KeyRound size={14} className="text-muted-foreground" />
            Reset User Password
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generate a new temporary password for a user. They're prompted to
            choose a real one at their next login.
          </p>
        </div>

        <Select value={userId} onChange={e => setUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
        </Select>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
          Email the new password to the user
        </label>

        <Button
          size="sm"
          disabled={!userId}
          loading={resetMut.isPending}
          onClick={() => resetMut.mutate()}
        >
          Reset Password
        </Button>
      </CardContent>

      <Dialog open={!!result} onOpenChange={(v) => !v && setResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Password reset</DialogTitle>
          </DialogHeader>
          {result && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                New temporary password for <strong>{result.userName}</strong>:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded-md font-mono text-sm break-all">{result.temp_password}</code>
                <Button size="sm" variant="outline" onClick={copyPassword}>
                  <Copy size={13} className="mr-1" /> Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {result.email_sent
                  ? 'An email with this password was also sent to the user.'
                  : sendEmail
                    ? 'Email sending failed — share this password with the user manually.'
                    : 'No email was sent — share this password with the user manually.'}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const qc = useQueryClient()
  // Other pages (Dashboard, FormDetail, SubmitForm, ApprovalAction) all
  // share the same ['my-organization'] queryKey but unwrap the axios
  // response inside their queryFn, so the cached value is the org data
  // object itself, not a full response. Calling getMyOrganization directly
  // here returned the raw response, which collided with the unwrapped
  // shape and surfaced as "Could not load organization settings." whenever
  // the cache was primed by another page first (i.e. always, except after
  // a hard refresh). Unwrap to match.
  const { data: org, isLoading } = useQuery({
    queryKey: ['my-organization'],
    queryFn: () => getMyOrganization().then(r => r.data),
  })

  const [accent, setAccent] = useState('')
  const [labels, setLabels] = useState(DEFAULT_LABELS)
  const [requireMfaForAll, setRequireMfaForAll] = useState(false)
  const [reauthDays, setReauthDays] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrls, setPreviewUrls] = useState({ header: null, footer: null })
  const initRef = useRef(false)

  // Fetch the header/footer object URLs on demand for the preview modal,
  // and revoke them when it closes.
  useEffect(() => {
    if (!previewOpen || !org) return
    let revoked = false
    const urls = { header: null, footer: null }
    const promises = []
    if (org.has_header_image) {
      promises.push(fetchHeaderImageObjectUrl().then(u => { urls.header = u }).catch(() => {}))
    }
    if (org.has_footer_image) {
      promises.push(fetchFooterImageObjectUrl().then(u => { urls.footer = u }).catch(() => {}))
    }
    Promise.all(promises).then(() => {
      if (!revoked) setPreviewUrls(urls)
    })
    return () => {
      revoked = true
      if (urls.header) URL.revokeObjectURL(urls.header)
      if (urls.footer) URL.revokeObjectURL(urls.footer)
      setPreviewUrls({ header: null, footer: null })
    }
  }, [previewOpen, org])

  useEffect(() => {
    if (org && !initRef.current) {
      setAccent(org.letterhead_accent || '')
      setLabels(
        org.classification_labels && org.classification_labels.length
          ? org.classification_labels
          : DEFAULT_LABELS
      )
      setRequireMfaForAll(!!org.require_mfa_for_all)
      setReauthDays(org.mfa_reauth_days != null ? String(org.mfa_reauth_days) : '')
      initRef.current = true
    }
  }, [org])

  const dirty = useMemo(() => {
    if (!org) return false
    const accentChanged = (org.letterhead_accent || '') !== accent
    const orgLabels = org.classification_labels && org.classification_labels.length
      ? org.classification_labels : DEFAULT_LABELS
    const labelsChanged = JSON.stringify(orgLabels) !== JSON.stringify(labels)
    const mfaToggleChanged = !!org.require_mfa_for_all !== requireMfaForAll
    const orgReauthDays = org.mfa_reauth_days != null ? String(org.mfa_reauth_days) : ''
    const reauthDaysChanged = orgReauthDays !== reauthDays
    return accentChanged || labelsChanged || mfaToggleChanged || reauthDaysChanged
  }, [org, accent, labels, requireMfaForAll, reauthDays])

  const updateMut = useMutation({
    mutationFn: () => updateMyOrganization({
      letterhead_accent: accent || null,
      classification_labels: labels,
      require_mfa_for_all: requireMfaForAll,
      mfa_reauth_days: reauthDays === '' ? null : parseInt(reauthDays, 10),
    }),
    onSuccess: () => {
      toast.success('Settings saved.')
      qc.invalidateQueries({ queryKey: ['my-organization'] })
      initRef.current = false
    },
    onError: (err) => {
      toast.error(err?.response?.data?.detail || 'Save failed.')
    },
  })

  const uploadHeaderMut = useMutation({
    mutationFn: uploadHeaderImage,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-organization'] }),
  })
  const uploadFooterMut = useMutation({
    mutationFn: uploadFooterImage,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-organization'] }),
  })
  const deleteHeaderMut = useMutation({
    mutationFn: deleteHeaderImage,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-organization'] }),
  })
  const deleteFooterMut = useMutation({
    mutationFn: deleteFooterImage,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-organization'] }),
  })

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-6 w-48 bg-muted rounded animate-pulse mb-3" />
        <div className="h-40 bg-muted rounded animate-pulse" />
      </div>
    )
  }

  if (!org) {
    return (
      <div className="p-6">
        <Alert variant="destructive">Could not load organization settings.</Alert>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Building2 size={18} className="text-muted-foreground" />
            Organization Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Letterhead and classification options applied to every form created in <strong>{org.name}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye size={14} className="mr-1.5" />
            Preview letterhead
          </Button>
          {dirty ? (
            <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
              <Save size={14} className="mr-1.5" />
              {updateMut.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-500/10 px-3 py-2 rounded-md border border-emerald-500/20">
              <Check size={14} /> All changes saved
            </span>
          )}
        </div>
      </div>

      {dirty && (
        <Alert>
          <AlertCircle size={14} className="inline mr-1.5" />
          You have unsaved changes. Image uploads save automatically.
        </Alert>
      )}

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="mfa">MFA &amp; Password Reset</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-5 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <LetterheadImageCard
              kind="header"
              hasImage={org.has_header_image}
              onUpload={uploadHeaderMut.mutateAsync}
              onDelete={deleteHeaderMut.mutateAsync}
              fetchObjectUrl={fetchHeaderImageObjectUrl}
              accentColor={accent}
            />
            <LetterheadImageCard
              kind="footer"
              hasImage={org.has_footer_image}
              onUpload={uploadFooterMut.mutateAsync}
              onDelete={deleteFooterMut.mutateAsync}
              fetchObjectUrl={fetchFooterImageObjectUrl}
              accentColor={accent}
            />
          </div>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Palette size={14} className="text-muted-foreground" />
                Letterhead Accent Color
              </h3>
              <p className="text-xs text-muted-foreground">
                Used for the title bar and section dividers on PDF exports. Leave blank to use the system default.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accent || '#0066B3'}
                  onChange={e => setAccent(e.target.value.toUpperCase())}
                  className="h-10 w-16 rounded border border-border cursor-pointer bg-transparent"
                />
                <Input
                  value={accent}
                  onChange={e => setAccent(e.target.value.toUpperCase())}
                  placeholder="#0066B3"
                  className="font-mono text-sm w-40"
                  maxLength={9}
                />
                {accent && (
                  <Button size="sm" variant="ghost" onClick={() => setAccent('')}>Clear</Button>
                )}
              </div>
            </CardContent>
          </Card>

          <ClassificationLabelsEditor labels={labels} onChange={setLabels} />

          <DatabaseBackupCard />
        </TabsContent>

        <TabsContent value="mfa" className="mt-5 space-y-6">
          <MfaPolicyCard
            requireMfaForAll={requireMfaForAll}
            onRequireMfaForAllChange={setRequireMfaForAll}
            reauthDays={reauthDays}
            onReauthDaysChange={setReauthDays}
          />
          <ResetUserPasswordCard />
        </TabsContent>
      </Tabs>

      {/* Letterhead preview: shows what every generated form will look like
          inside the org letterhead frame. Reused later by the fill page
          and the PDF export. */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye size={16} /> Letterhead preview
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1 mb-3">
            This is how every generated form will be framed by your letterhead.
            The body content is a placeholder. The real form schema will live here once Phase&nbsp;C ships.
          </p>
          <div className="bg-muted/30 rounded-lg p-4 max-h-[70vh] overflow-y-auto">
            <div className="mx-auto" style={{ width: 'min(640px, 100%)' }}>
              <LetterheadPage
                headerImageUrl={previewUrls.header}
                footerImageUrl={previewUrls.footer}
                accentColor={accent}
                classification={
                  labels.find(l => l.name.toLowerCase() === 'internal') ||
                  labels[0] ||
                  null
                }
              >
                <SampleFormBody accentColor={accent || '#0066B3'} />
              </LetterheadPage>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
