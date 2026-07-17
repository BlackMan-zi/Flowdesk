import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getFormInstance, getFormDefinition, downloadAttachment, fetchAttachmentBlobUrl, downloadFormPdf } from '../api/forms'
import { adminCancelForm, adminSendBackForm, reassignStep } from '../api/approvals'
import { listUsersDirectory } from '../api/users'
import { getMyOrganization, fetchHeaderImageObjectUrl, fetchFooterImageObjectUrl } from '../api/settings'
import { useAuth } from '../context/AuthContext'
import Card, { CardHeader } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { SkeletonFormDetail } from '../components/ui/Skeleton'
import { Select, Textarea } from '../components/ui/Input'
import FormFillerCanvas from '../components/forms/FormFillerCanvas'
import VersionHistory from '../components/forms/VersionHistory'
import { resolveClassification } from '../lib/classification'
import { dedupeChain } from '../lib/approvalChain'
import {
  ChevronLeft, CheckCircle2, XCircle, Clock, RotateCcw,
  SkipForward, ShieldAlert, UserCog, Hash, User, Calendar,
  FileText, AlertCircle, Paperclip, Download, Eye, Printer, X, Pencil
} from 'lucide-react'

// ── Step icon ─────────────────────────────────────────────────────────────────

function StepIcon({ status }) {
  const map = {
    Approved:    { icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-500 ring-1 ring-emerald-300' },
    Rejected:    { icon: XCircle,      cls: 'bg-red-100 text-red-500 ring-1 ring-red-300' },
    Active:      { icon: Clock,        cls: 'bg-amber-100 text-amber-500 ring-2 ring-amber-300' },
    Waiting:     { icon: Clock,        cls: 'bg-slate-100 text-slate-300 ring-1 ring-slate-200' },
    'Sent Back': { icon: RotateCcw,    cls: 'bg-orange-100 text-orange-500 ring-1 ring-orange-300' },
    Skipped:     { icon: SkipForward,  cls: 'bg-slate-100 text-slate-400 ring-1 ring-slate-200' },
  }
  const cfg = map[status] || map['Waiting']
  const Icon = cfg.icon
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.cls}`}>
      <Icon size={16} />
    </div>
  )
}

// ── Progress bar at top ───────────────────────────────────────────────────────

function ApprovalProgressBar({ steps }) {
  if (!steps.length) return null
  const approved = steps.filter(s => s.status === 'Approved').length
  const total    = steps.filter(s => s.status !== 'Skipped').length
  const pct      = total > 0 ? Math.round((approved / total) * 100) : 0

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-slate-800">Approval Progress</p>
        <span className="text-xs font-bold text-slate-500">{approved}/{total} steps</span>
      </div>
      {/* Visual step track */}
      <div className="flex items-center gap-1.5 mb-3">
        {steps.filter(s => s.status !== 'Skipped').map((s, i) => (
          <div key={s.id || i} className="flex-1 flex flex-col items-center gap-1">
            <div className={`h-2 w-full rounded-full transition-all ${
              s.status === 'Approved' ? 'bg-emerald-500' :
              s.status === 'Active'   ? 'bg-amber-400 animate-pulse' :
              s.status === 'Rejected' ? 'bg-red-400' :
              s.status === 'Sent Back'? 'bg-orange-400' :
                                        'bg-slate-200'
            }`} />
            <span className="text-[10px] text-slate-400 text-center leading-tight truncate w-full text-center">
              {s.step_label || `Step ${s.step_order}`}
            </span>
          </div>
        ))}
      </div>
      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-emerald-500 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-400 mt-1.5">{pct}% complete</p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function FormDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, isObserver, isAdmin } = useAuth()

  const [adminModal, setAdminModal] = useState(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignUserId, setReassignUserId] = useState('')
  const [reassignNotes, setReassignNotes] = useState('')
  const [previewMode, setPreviewMode] = useState(false)

  const { data: instance, isLoading } = useQuery({
    queryKey: ['form-instance', id],
    queryFn: () => getFormInstance(id).then(r => r.data),
    refetchInterval: 10_000
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: () => listUsersDirectory().then(r => r.data),
    staleTime: 60_000
  })

  // Org for classification labels + accent + letterhead images
  const { data: org } = useQuery({
    queryKey: ['my-organization'],
    queryFn: () => getMyOrganization().then(r => r.data),
  })

  // Authoritative form schema (so canvas gets section_name, grid_width, etc.)
  const { data: formDef } = useQuery({
    queryKey: ['form-definition', instance?.form_definition_id],
    queryFn: () => getFormDefinition(instance.form_definition_id).then(r => r.data),
    enabled: !!instance?.form_definition_id,
  })

  const [letterheadUrls, setLetterheadUrls] = useState({ header: null, footer: null })
  useEffect(() => {
    if (!org) return
    let cancelled = false
    const urls = { header: null, footer: null }
    const ps = []
    if (org.has_header_image) ps.push(fetchHeaderImageObjectUrl().then(u => { urls.header = u }).catch(() => {}))
    if (org.has_footer_image) ps.push(fetchFooterImageObjectUrl().then(u => { urls.footer = u }).catch(() => {}))
    Promise.all(ps).then(() => { if (!cancelled) setLetterheadUrls(urls) })
    return () => {
      cancelled = true
      if (urls.header) URL.revokeObjectURL(urls.header)
      if (urls.footer) URL.revokeObjectURL(urls.footer)
    }
  }, [org?.id, org?.has_header_image, org?.has_footer_image])

  // Pre-fetch blob URLs for image / PDF attachments so the canvas can show
  // them inline. xls / doc / other types stay as a download list, no fetch
  // needed. Re-runs only when the attachment id set actually changes.
  const [attachmentUrls, setAttachmentUrls] = useState({})
  const inlineableIdsKey = (instance?.attachments || [])
    .filter(a => /^image\//.test(a.content_type || '') || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(a.original_filename || '')
              || (a.content_type === 'application/pdf') || /\.pdf$/i.test(a.original_filename || ''))
    .map(a => a.id)
    .join(',')
  useEffect(() => {
    if (!inlineableIdsKey) return
    const ids = inlineableIdsKey.split(',').filter(Boolean)
    let cancelled = false
    const urls = {}
    Promise.all(ids.map(id =>
      fetchAttachmentBlobUrl(id).then(u => { urls[id] = u }).catch(() => {})
    )).then(() => {
      if (!cancelled) setAttachmentUrls(urls)
    })
    return () => {
      cancelled = true
      Object.values(urls).forEach(u => URL.revokeObjectURL(u))
    }
  }, [inlineableIdsKey])

  const cancelMutation = useMutation({
    mutationFn: () => adminCancelForm(id, { notes: adminNotes || null }),
    onSuccess: () => {
      qc.invalidateQueries(['form-instance', id])
      qc.invalidateQueries(['form-instances'])
      setAdminModal(null)
      setAdminNotes('')
      toast.success('Form cancelled successfully')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Action failed.')
  })

  const sendBackMutation = useMutation({
    mutationFn: () => adminSendBackForm(id, { notes: adminNotes }),
    onSuccess: () => {
      qc.invalidateQueries(['form-instance', id])
      qc.invalidateQueries(['form-instances'])
      setAdminModal(null)
      setAdminNotes('')
      toast.success('Form sent back to initiator')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Action failed.')
  })

  const reassignMutation = useMutation({
    mutationFn: () => reassignStep(id, { new_approver_user_id: reassignUserId, notes: reassignNotes || null }),
    onSuccess: () => {
      qc.invalidateQueries(['form-instance', id])
      setReassignOpen(false)
      setReassignUserId('')
      setReassignNotes('')
      toast.success('Step reassigned successfully')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Reassign failed.')
  })

  if (isLoading) return <SkeletonFormDetail />
  if (!instance) return (
    <div className="flex flex-col items-center justify-center py-20">
      <FileText size={32} className="text-slate-300 mb-3" />
      <p className="text-slate-500 font-medium">Form not found.</p>
    </div>
  )

  const canResubmit   = instance.current_status === 'Returned for Correction'
  const isCompleted   = instance.current_status === 'Completed' || instance.current_status === 'Approved'
  const canExportPdf  = isCompleted
  const canEditDraft  = instance.current_status === 'Draft' && instance.created_by === user?.id
  const canEditReturned = canResubmit && instance.created_by === user?.id
  const isTerminal    = ['Completed', 'Approved', 'Rejected'].includes(instance.current_status)
  const isUnderReview = ['Pending', 'Submitted'].includes(instance.current_status)

  const openAdminModal = (type) => { setAdminModal(type); setAdminNotes('') }
  const openReassign   = () => { setReassignOpen(true); setReassignUserId(''); setReassignNotes('') }

  // dedupeChain collapses any duplicate rows-per-template-step that older
  // /submit + /resubmit bugs may have left on the version; sort is also
  // handled there. Always emits one row per step_order.
  const rawApprovalSteps = dedupeChain(
    instance.versions?.[instance.current_version - 1]?.approval_instances || []
  )
  const activeStep = rawApprovalSteps.find(s => s.status === 'Active')

  // Prepend a synthetic "Submitted by" step so the chain shows the
  // initiator's contribution before any approvers act. Pre-submit drafts
  // don't get it (instance.submitted_at is null).
  const initiatorStep = instance.submitted_at ? {
    id: '__initiator__',
    step_order: 0,
    step_label: 'Submitted by Initiator',
    status: 'Approved',
    approver: instance.creator,
    signed_at: instance.submitted_at,
  } : null
  const approvalSteps = initiatorStep
    ? [initiatorStep, ...rawApprovalSteps]
    : rawApprovalSteps

  const currentVersion = instance.versions?.[instance.current_version - 1]
  const fieldValues = currentVersion?.field_values || []

  // Prefer the frozen schema snapshot from the submitted version so admin
  // edits to the form definition (rename / delete a field, change layout)
  // don't disturb already-submitted forms. Falls back to the live formDef
  // for pre-snapshot legacy rows.
  const effectiveFormDef = currentVersion?.schema_snapshot
    ? {
        id: instance.form_definition_id,
        approval_template: formDef?.approval_template,
        ...currentVersion.schema_snapshot,
      }
    : formDef

  // Build {[form_field_id]: value} map for the canvas.
  const fieldValuesMap = {}
  for (const fv of fieldValues) {
    fieldValuesMap[fv.form_field_id || fv.form_field?.id] = fv.value
  }

  // Resolve classification for the canvas. Uses effectiveFormDef so the
  // snapshot's confidentiality wins over the live form's current setting.
  // Falls back to the standard palette when org hasn't customised labels.
  const classification = resolveClassification(
    effectiveFormDef?.confidentiality,
    org?.classification_labels,
  )

  // For the inline approval block on the form: pass only the REAL approval
  // steps. The canvas's ApprovalRows component already prepends its own
  // "Requested by <initiator>" row. Including the synthetic initiator step
  // here would double that row up.
  const renderedApprovalSteps = rawApprovalSteps.length > 0
    ? rawApprovalSteps.map(s => ({
        ...s,
        source_type: s.role_type === 'Hierarchy' ? 'hierarchy'
                  : s.role_type === 'Role'      ? 'role'
                  : s.role_type === 'Specific'  ? 'specific_user'
                  : s.source_type,
        specific_user_name: s.approver?.name,
      }))
    : (formDef?.approval_template?.steps || [])

  // ── Preview mode ──
  // Strips admin chrome / page header so the page reads like a printable
  // document. Browser print (Ctrl/Cmd+P → Save as PDF) gives a single-PDF
  // export for now; proper server-side PDF + attachment merging is the
  // next deliverable. The `print:hidden` utility classes hide the toolbar
  // and timeline section from the actual print output.
  if (previewMode && effectiveFormDef) {
    return (
      <div className="bg-slate-100 min-h-screen py-6 print:py-0 print:bg-white">
        <div className="max-w-3xl mx-auto space-y-4 px-4">
          <div className="flex items-center justify-between print:hidden gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPreviewMode(false)}>
              <X size={14} /> Exit Preview
            </Button>
            <div className="text-xs text-slate-500 flex-1 text-center">
              {instance.form_definition?.name} · <span className="font-mono">{instance.reference_number}</span>
            </div>
            <div className="flex items-center gap-2">
              {canExportPdf && (
                <Button
                  size="sm"
                  onClick={() => downloadFormPdf(id, instance.reference_number).catch(err =>
                    toast.error(err?.response?.data?.detail || 'PDF export failed.')
                  )}
                >
                  <Download size={14} /> Download Final PDF
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                <Printer size={14} /> Print
              </Button>
            </div>
          </div>

          {/* The form, full-width, no surrounding muted card */}
          <FormFillerCanvas
            formDef={effectiveFormDef}
            headerUrl={letterheadUrls.header}
            footerUrl={letterheadUrls.footer}
            accent={org?.letterhead_accent}
            classification={classification}
            user={instance.creator}
            users={users}
            roles={[]}
            approvalSteps={renderedApprovalSteps}
            initiatorSignatureData={instance.initiator_signature_data}
            initiatorSignedAt={instance.initiator_signed_at}
            referenceNumber={instance.reference_number}
            fieldValues={fieldValuesMap}
            onFieldChange={() => {}}
            pendingFiles={{}}
            onFilesChange={() => {}}
            attachments={instance.attachments}
            attachmentUrls={attachmentUrls}
            disabled
          />

          {/* Approval history + attachments are now rendered inside the
              FormFillerCanvas body (above the footer band) so they print as
              part of the document. No duplicate cards here. */}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl space-y-4">

      {/* Header: full width across the layout */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 truncate">
              {instance.form_definition?.name || 'Form'}
            </h1>
            <Badge label={instance.current_status} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Hash size={11} />{instance.reference_number}
            </span>
            {instance.creator?.name && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <User size={11} />{instance.creator.name}
              </span>
            )}
            {instance.submitted_at && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Calendar size={11} />{fmt(instance.submitted_at)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEditDraft && (
            <Button size="sm" onClick={() => navigate(`/my-forms/${id}/edit`)}>
              <Pencil size={14} /> Edit Draft
            </Button>
          )}
          {canEditReturned && (
            <Button size="sm" onClick={() => navigate(`/my-forms/${id}/edit`)}>
              <Pencil size={14} /> Edit & Resubmit
            </Button>
          )}
          {canExportPdf && (
            <Button
              size="sm"
              onClick={() => downloadFormPdf(id, instance.reference_number).catch(err =>
                toast.error(err?.response?.data?.detail || 'PDF export failed.')
              )}
            >
              <Download size={14} /> Download PDF
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setPreviewMode(true)}>
            <Eye size={14} /> Preview
          </Button>
        </div>
      </div>

      {/* Returned alert (full-width, needs the user's attention before anything else) */}
      {canResubmit && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-orange-900">Action required</p>
            <p className="text-xs text-orange-700 mt-0.5">This form was returned for correction. Review the feedback, make your changes, and resubmit.</p>
          </div>
          <Button size="sm" onClick={() => navigate(`/my-forms/${id}/edit`)}>
            Correct & Resubmit
          </Button>
        </div>
      )}

      {/* Two-column layout on wide screens: form document + attachments on
          the left, workflow chrome (progress, version history, chain,
          actions, admin overrides) pinned to a sticky right column. Stacks
          vertically on narrow screens. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:items-start">

        {/* Left column (2/3): the document being reviewed */}
        <div className="lg:col-span-2 space-y-4 min-w-0">

      {/* Form data (WYSIWYG, read-only) */}
      {effectiveFormDef ? (
        <div className="bg-muted/30 rounded-lg p-4">
          <FormFillerCanvas
            formDef={effectiveFormDef}
            headerUrl={letterheadUrls.header}
            footerUrl={letterheadUrls.footer}
            accent={org?.letterhead_accent}
            classification={classification}
            user={instance.creator}
            users={users}
            roles={[]}
            approvalSteps={renderedApprovalSteps}
            initiatorSignatureData={instance.initiator_signature_data}
            initiatorSignedAt={instance.initiator_signed_at}
            referenceNumber={instance.reference_number}
            fieldValues={fieldValuesMap}
            onFieldChange={() => {}}
            pendingFiles={{}}
            onFilesChange={() => {}}
            attachments={instance.attachments}
            attachmentUrls={attachmentUrls}
            disabled
          />
          <p className="text-center text-[10px] text-muted-foreground mt-2">
            Version {instance.current_version}{instance.current_version > 1 ? ' (revised)' : ''}
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader title="Form Data" />
          <p className="px-6 py-8 text-sm text-slate-400 text-center">Loading form layout…</p>
        </Card>
      )}

      {/* Attachments uploaded with this submission stay in the LEFT
          column with the form they belong to. */}
      {(instance.attachments?.length || 0) > 0 && (
        <Card>
          <CardHeader
            title="Attachments"
            subtitle={`${instance.attachments.length} file${instance.attachments.length === 1 ? '' : 's'}`}
          />
          <div className="divide-y divide-slate-100">
            {instance.attachments.map(att => (
              <div key={att.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Paperclip size={14} className="text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-800 font-medium truncate">{att.original_filename}</p>
                  <p className="text-xs text-slate-400">
                    {att.file_size != null ? `${(att.file_size / 1024).toFixed(1)} KB · ` : ''}
                    {att.uploaded_at ? fmt(att.uploaded_at) : ''}
                    {att.uploaded_after_submission ? ' · added after submission' : ''}
                  </p>
                </div>
                <button
                  onClick={() => downloadAttachment(att.id, att.original_filename)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Download size={12} /> Download
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

        </div>{/* /left column */}

        {/* Right column (1/3), sticky workflow chrome: progress bar,
            version history, the detailed approval chain, action buttons,
            admin overrides. Always visible while scrolling the form. */}
        <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">

      {/* Approval progress bar */}
      {approvalSteps.length > 0 && (
        <ApprovalProgressBar steps={approvalSteps} />
      )}

      {/* Version history (only renders when there's more than one version) */}
      <VersionHistory versions={instance.versions} currentVersion={instance.current_version} />

      {/* Approval Chain: compact one-line-per-step layout so the whole
          chain fits in a glance and you can see immediately who needs
          to act next. Notes still expand under each step that has them. */}
      {approvalSteps.length > 0 && (
        <Card>
          <CardHeader
            title="Approval Chain"
            subtitle={`${approvalSteps.filter(s => s.status === 'Approved').length} of ${approvalSteps.length} steps completed`}
          />
          <div className="px-5 py-3">
            <ol className="space-y-1.5">
              {approvalSteps.map(ap => {
                const isActive = ap.status === 'Active'
                const isDone   = ap.status === 'Approved'
                return (
                  <li
                    key={ap.id}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                      isActive ? 'bg-amber-50 border border-amber-200'
                      : isDone  ? 'bg-emerald-50/40 border border-emerald-100'
                                : 'bg-slate-50 border border-slate-100 opacity-80'
                    }`}
                  >
                    <StepIcon status={ap.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <p className={`text-sm font-bold truncate ${
                          isActive ? 'text-amber-900' : isDone ? 'text-emerald-900' : 'text-slate-600'
                        }`}>
                          {ap.step_label || `Step ${ap.step_order}`}
                        </p>
                        {ap.approver?.name && (
                          <span className={`text-xs ${
                            isActive ? 'text-amber-800 font-semibold' : 'text-slate-500'
                          }`}>
                            · {ap.approver.name}
                            {ap.delegated_from?.name && (
                              <span className="font-normal text-slate-400"> (via {ap.delegated_from.name})</span>
                            )}
                          </span>
                        )}
                        {ap.signed_at && (
                          <span className="text-[10px] text-slate-400 ml-auto">
                            {new Date(ap.signed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                      {ap.notes && (
                        <p className="text-[11px] text-slate-600 mt-1 italic truncate" title={ap.notes}>
                          "{ap.notes}"
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge label={ap.status} />
                      {isAdmin && isActive && !isTerminal && (
                        <button
                          onClick={openReassign}
                          title="Reassign this step"
                          className="w-6 h-6 rounded-md hover:bg-amber-100 text-amber-700 flex items-center justify-center"
                        >
                          <UserCog size={12} />
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </Card>
      )}

      {/* Actions */}
      {!isObserver && (
        <div className="flex gap-3 flex-wrap">
          {canResubmit && (
            <Button onClick={() => navigate(`/my-forms/${id}/edit`)}>
              Correct & Resubmit
            </Button>
          )}
          {isCompleted && (
            <Button variant="secondary" onClick={() => navigate('/documents')}>
              View Documents
            </Button>
          )}
        </div>
      )}

      {/* Admin overrides */}
      {isAdmin && !isTerminal && (
        <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <ShieldAlert size={14} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">Admin Controls</p>
              <p className="text-xs text-amber-700">Override actions for this form</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isUnderReview && (
              <Button size="sm" variant="secondary" onClick={() => openAdminModal('send-back')}>
                <RotateCcw size={13} /> Send Back to Initiator
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openAdminModal('cancel')}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              <XCircle size={13} /> Cancel Form
            </Button>
          </div>
        </div>
      )}

        </div>{/* /right column */}
      </div>{/* /two-column grid */}

      {/* Admin action modal */}
      <Modal
        open={!!adminModal}
        onClose={() => setAdminModal(null)}
        title={adminModal === 'cancel' ? 'Cancel Form' : 'Send Back for Correction'}
        subtitle={
          adminModal === 'cancel'
            ? 'This will permanently cancel the form. The initiator will be notified.'
            : 'This will return the form to the initiator. All pending steps will be cleared.'
        }
        size="sm"
        footer={
          <div className="flex gap-3">
            {adminModal === 'cancel' ? (
              <Button
                variant="danger"
                onClick={() => cancelMutation.mutate()}
                loading={cancelMutation.isPending}
              >
                Cancel Form
              </Button>
            ) : (
              <Button
                onClick={() => sendBackMutation.mutate()}
                loading={sendBackMutation.isPending}
              >
                Send Back
              </Button>
            )}
            <Button variant="secondary" onClick={() => setAdminModal(null)}>Dismiss</Button>
          </div>
        }
      >
        <Textarea
          label={adminModal === 'cancel' ? 'Reason (optional)' : 'Reason (required)'}
          value={adminNotes}
          onChange={e => setAdminNotes(e.target.value)}
          rows={3}
          placeholder={adminModal === 'cancel' ? 'e.g. Duplicate submission' : 'e.g. Missing supporting documents'}
        />
      </Modal>

      {/* Reassign modal */}
      <Modal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        title="Reassign Approval Step"
        subtitle={activeStep ? `Currently with ${activeStep.approver?.name || 'unknown'} · "${activeStep.step_label || `Step ${activeStep.step_order}`}"` : undefined}
        size="sm"
        footer={
          <div className="flex gap-3">
            <Button
              onClick={() => reassignMutation.mutate()}
              loading={reassignMutation.isPending}
              disabled={!reassignUserId}
            >
              Reassign Step
            </Button>
            <Button variant="secondary" onClick={() => setReassignOpen(false)}>Cancel</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="New Approver"
            value={reassignUserId}
            onChange={e => setReassignUserId(e.target.value)}
            required
          >
            <option value="">Select user…</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </Select>
          <Textarea
            label="Reason (optional)"
            value={reassignNotes}
            onChange={e => setReassignNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Original approver is on leave"
          />
        </div>
      </Modal>
    </div>
  )
}

function fmt(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
