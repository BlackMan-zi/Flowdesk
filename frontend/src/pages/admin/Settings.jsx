import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getMyOrganization, updateMyOrganization,
  uploadHeaderImage, uploadFooterImage,
  deleteHeaderImage, deleteFooterImage,
  fetchHeaderImageObjectUrl, fetchFooterImageObjectUrl,
} from '../../api/settings'
import { Card, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Alert } from '../../components/ui/alert'
import { cn } from '../../lib/utils'
import {
  Upload, Trash2, Image as ImageIcon, Building2, Palette, Shield,
  Plus, X, Save, AlertCircle, Check, GripVertical,
} from 'lucide-react'

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
              Any image format — PNG, JPG, WEBP, GIF, BMP, TIFF, ICO, AVIF. Max&nbsp;8&nbsp;MB.
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
            These show up when an admin creates or edits a form — they pick which one applies. Click a label's color dot to change its color.
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
            <p className="text-xs text-muted-foreground italic">No labels — forms will not show a classification field.</p>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const qc = useQueryClient()
  const { data: orgRes, isLoading } = useQuery({
    queryKey: ['my-organization'],
    queryFn: getMyOrganization,
  })
  const org = orgRes?.data

  const [accent, setAccent] = useState('')
  const [labels, setLabels] = useState(DEFAULT_LABELS)
  const initRef = useRef(false)

  useEffect(() => {
    if (org && !initRef.current) {
      setAccent(org.letterhead_accent || '')
      setLabels(
        org.classification_labels && org.classification_labels.length
          ? org.classification_labels
          : DEFAULT_LABELS
      )
      initRef.current = true
    }
  }, [org])

  const dirty = useMemo(() => {
    if (!org) return false
    const accentChanged = (org.letterhead_accent || '') !== accent
    const orgLabels = org.classification_labels && org.classification_labels.length
      ? org.classification_labels : DEFAULT_LABELS
    const labelsChanged = JSON.stringify(orgLabels) !== JSON.stringify(labels)
    return accentChanged || labelsChanged
  }, [org, accent, labels])

  const updateMut = useMutation({
    mutationFn: () => updateMyOrganization({
      letterhead_accent: accent || null,
      classification_labels: labels,
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

        {/* Save state indicator — explicit feedback instead of a grayed button */}
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

      {dirty && (
        <Alert>
          <AlertCircle size={14} className="inline mr-1.5" />
          You have unsaved changes to accent color and/or classification labels. Image uploads save automatically.
        </Alert>
      )}

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
    </div>
  )
}
