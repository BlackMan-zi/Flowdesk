import React, { useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import SignatureCanvas from 'react-signature-canvas'
import { getFormInstance } from '../api/forms'
import { approveForm, rejectForm, sendBackForm, getPendingApprovals } from '../api/approvals'
import { useAuth } from '../context/AuthContext'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Card, { CardHeader } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import Input, { Select, Textarea } from '../components/ui/Input'
import {
  ChevronLeft, Check, X, RotateCcw, CheckCircle2, Clock,
  Circle, AlertCircle, PenTool, Trash2, History
} from 'lucide-react'

// ── Approval chain step ───────────────────────────────────────────────────────

function ChainStep({ step, isLast }) {
  const isApproved = step.status === 'Approved' || step.status === 'approved'
  const isRejected = step.status === 'Rejected' || step.status === 'rejected'
  const isActive   = step.status === 'Active'   || step.status === 'active'
  const isSentBack = step.status === 'Sent Back' || step.status === 'sent_back' || step.status === 'SendBack'
  const isSkipped  = step.status === 'Skipped'  || step.status === 'skipped'

  const ringCls = isApproved ? 'bg-emerald-100 text-emerald-600 ring-1 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-400 dark:ring-emerald-700'
                : isRejected ? 'bg-red-100 text-red-600 ring-1 ring-red-300 dark:bg-red-900/40 dark:text-red-400 dark:ring-red-700'
                : isSentBack ? 'bg-orange-100 text-orange-600 ring-1 ring-orange-300 dark:bg-orange-900/40 dark:text-orange-400 dark:ring-orange-700'
                : isActive   ? 'bg-amber-100 text-amber-600 ring-2 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:ring-amber-600'
                :              'bg-muted text-muted-foreground ring-1 ring-border'

  const Icon = isApproved ? CheckCircle2
             : isRejected ? AlertCircle
             : isSentBack ? RotateCcw
             : isActive   ? Clock
             :              Circle

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', ringCls)}>
          <Icon size={15} />
        </div>
        {!isLast && <div className="w-px flex-1 min-h-6 bg-border my-1" />}
      </div>
      <div className="pb-4 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={cn('text-sm font-semibold', isActive ? 'text-foreground' : 'text-foreground/80')}>
              {step.step_label || `Step ${step.step_order}`}
            </p>
            {step.approver && (
              <p className="text-xs text-muted-foreground">{step.approver.name}</p>
            )}
            {step.delegated_from && (
              <p className="text-xs text-amber-500">Acting for {step.delegated_from.name}</p>
            )}
          </div>
          <div className="flex-shrink-0">
            {isActive
              ? <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full dark:bg-amber-900/40 dark:text-amber-400">Awaiting decision</span>
              : <Badge label={step.status} />
            }
          </div>
        </div>
        {step.signed_at && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(step.signed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        {step.notes && (
          <div className="mt-1.5 bg-muted/50 border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground italic">
            "{step.notes}"
          </div>
        )}
      </div>
    </div>
  )
}

// ── Version history panel ─────────────────────────────────────────────────────

function VersionHistory({ versions, currentVersion }) {
  const [open, setOpen] = useState(false)
  if (!versions || versions.length <= 1) return null

  const sorted = [...versions].sort((a, b) => b.version_number - a.version_number)

  return (
    <Card>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <History size={15} className="text-muted-foreground" />
          Version History
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
            {versions.length} versions
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{open ? 'Collapse ▲' : 'Expand ▼'}</span>
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {sorted.map(ver => {
            const isCurrent = ver.version_number === currentVersion
            const sentBackStep = ver.approval_instances?.find(
              a => a.status === 'sent_back' || a.status === 'Sent Back' || a.status === 'SendBack'
            )
            return (
              <div key={ver.id} className={cn('px-5 py-3', isCurrent && 'bg-primary/5')}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded',
                    isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>
                    v{ver.version_number}
                  </span>
                  {isCurrent && <span className="text-xs text-primary font-medium">Current</span>}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {ver.created_at && new Date(ver.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                {ver.change_notes && (
                  <p className="text-xs text-muted-foreground italic">Submitter note: "{ver.change_notes}"</p>
                )}
                {sentBackStep && (
                  <div className="mt-1.5 flex items-start gap-1.5 bg-orange-50 border border-orange-200 rounded px-2.5 py-1.5 dark:bg-orange-900/20 dark:border-orange-800">
                    <RotateCcw size={11} className="text-orange-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-orange-800 font-medium dark:text-orange-300">
                        Sent back by {sentBackStep.approver?.name || 'approver'}
                      </p>
                      {sentBackStep.notes && (
                        <p className="text-xs text-orange-700 italic mt-0.5 dark:text-orange-400">"{sentBackStep.notes}"</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ── Signature capture ─────────────────────────────────────────────────────────

function SignatureCapture({ value, onChange }) {
  const sigRef = useRef(null)
  const [signed, setSigned] = useState(!!value)

  const handleEnd = () => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      const data = sigRef.current.toDataURL('image/png')
      onChange(data)
      setSigned(true)
    }
  }

  const handleClear = () => {
    sigRef.current?.clear()
    onChange(null)
    setSigned(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <PenTool size={14} className="text-muted-foreground" />
          Signature <span className="text-destructive ml-0.5">*</span>
        </label>
        {signed && (
          <button onClick={handleClear} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors">
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>
      <div className={cn(
        'border-2 border-dashed rounded-lg bg-muted/20 overflow-hidden relative transition-colors',
        signed ? 'border-border' : 'border-muted-foreground/30 hover:border-primary/60'
      )}>
        <SignatureCanvas
          ref={sigRef}
          onEnd={handleEnd}
          canvasProps={{
            width: 560,
            height: 120,
            className: 'w-full block',
            style: { touchAction: 'none' }
          }}
          backgroundColor="transparent"
          penColor="currentColor"
        />
        {!signed && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none select-none">
            Sign here with your mouse or touch
          </p>
        )}
      </div>
      {!signed && (
        <p className="text-xs text-destructive">A signature is required to proceed.</p>
      )}
    </div>
  )
}

// ── Approver fields section ───────────────────────────────────────────────────

function ApproverFields({ fields, fieldValues, myHierarchyLevel, onChange }) {
  const LEVEL_MAP = { manager: 'line_manager', sn_manager: 'sn_manager', hod: 'hod' }
  const myFilledBy = LEVEL_MAP[myHierarchyLevel] || null

  const myFields = fields.filter(f => f.filled_by === myFilledBy || f.filled_by === 'any')
  if (!myFields.length) return null

  return (
    <Card>
      <CardHeader
        title="Fields to Complete"
        subtitle="These fields are assigned to you — fill them before approving"
      />
      <div className="p-5 space-y-4">
        {myFields.map(field => {
          const val = fieldValues[field.id] || ''
          const commonProps = {
            key: field.id,
            label: `${field.field_label}${field.required ? ' *' : ''}`,
            value: val,
          }
          if (field.field_type === 'textarea') {
            return <Textarea {...commonProps} rows={3} onChange={e => onChange(field.id, e.target.value)} />
          }
          if (field.field_type === 'dropdown') {
            return (
              <Select {...commonProps} onChange={e => onChange(field.id, e.target.value)}>
                <option value="">Select…</option>
                {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
              </Select>
            )
          }
          if (field.field_type === 'date') {
            return <Input {...commonProps} type="date" onChange={e => onChange(field.id, e.target.value)} />
          }
          if (field.field_type === 'number' || field.field_type === 'currency') {
            return <Input {...commonProps} type="number" onChange={e => onChange(field.id, e.target.value)} />
          }
          return <Input {...commonProps} type="text" onChange={e => onChange(field.id, e.target.value)} />
        })}
      </div>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ApprovalAction() {
  const { formInstanceId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()

  const [action, setAction]       = useState(null)
  const [notes, setNotes]         = useState('')
  const [signature, setSignature] = useState(null)
  const [approverValues, setApproverValues] = useState({})
  const [error, setError]         = useState('')

  const { data: instance, isLoading } = useQuery({
    queryKey: ['form-instance', formInstanceId],
    queryFn: () => getFormInstance(formInstanceId).then(r => r.data),
    refetchInterval: 15_000
  })

  const { data: pending = [] } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => getPendingApprovals().then(r => r.data),
  })
  const pendingItem      = pending.find(p => p.form_instance_id === formInstanceId)
  const myHierarchyLevel = pendingItem?.hierarchy_level || null

  const mutation = useMutation({
    mutationFn: () => {
      if (action === 'approve' && !signature) throw new Error('Signature is required.')
      if ((action === 'reject' || action === 'send_back') && !notes.trim())
        throw new Error('Notes are required when rejecting or sending back.')

      const fieldValuesArr = Object.entries(approverValues).map(([form_field_id, value]) => ({
        form_field_id, value: value != null ? String(value) : ''
      }))

      const payload = { notes, signature_data: signature, field_values: fieldValuesArr }
      if (action === 'approve')   return approveForm(formInstanceId, payload)
      if (action === 'reject')    return rejectForm(formInstanceId, payload)
      if (action === 'send_back') return sendBackForm(formInstanceId, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries(['approvals'])
      qc.invalidateQueries(['dashboard'])
      toast.success(
        action === 'approve'   ? 'Request approved.' :
        action === 'reject'    ? 'Request rejected.' :
                                 'Request returned for correction.'
      )
      navigate('/approvals')
    },
    onError: (err) => {
      const msg = err.message || err.response?.data?.detail || 'Action failed.'
      setError(msg)
      toast.error(msg)
    }
  })

  const handleConfirm = () => { setError(''); mutation.mutate() }

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (!instance) return <p className="text-muted-foreground p-8">Form not found.</p>

  const currentVersion = instance.versions?.find(v => v.version_number === instance.current_version)
                      || instance.versions?.[instance.current_version - 1]
  const approvalSteps  = (currentVersion?.approval_instances || []).slice().sort((a, b) => a.step_order - b.step_order)
  const myStep         = approvalSteps.find(a => a.status === 'Active' || a.status === 'active')
  const isPending      = instance.current_status === 'Pending'
  const fieldValues    = currentVersion?.field_values || []
  const formFields     = instance.form_definition?.fields || []

  const setApproverField = (fieldId, val) =>
    setApproverValues(p => ({ ...p, [fieldId]: val }))

  return (
    <div className="max-w-2xl space-y-5">

      {/* Back + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/approvals')}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground truncate">
              {instance.form_definition?.name || 'Form'}
            </h1>
            <Badge label={instance.current_status} />
            {instance.current_version > 1 && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">
                v{instance.current_version} — revised
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {instance.reference_number}
            {instance.creator?.name && <span> · Submitted by <strong className="text-foreground">{instance.creator.name}</strong></span>}
          </p>
        </div>
      </div>

      {/* 1. Approval chain */}
      {approvalSteps.length > 0 && (
        <Card>
          <CardHeader
            title="Approval Chain"
            subtitle={`${approvalSteps.filter(s => s.status === 'Approved' || s.status === 'approved').length} of ${approvalSteps.length} steps completed`}
          />
          <div className="px-6 pt-4 pb-1">
            {approvalSteps.map((step, i) => (
              <ChainStep key={step.id} step={step} isLast={i === approvalSteps.length - 1} />
            ))}
          </div>
        </Card>
      )}

      {/* 2. Version history */}
      <VersionHistory versions={instance.versions} currentVersion={instance.current_version} />

      {/* 3. Form data */}
      <Card>
        <CardHeader title="Request Details" subtitle={`Version ${instance.current_version}`} />
        {fieldValues.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">No field data available.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {fieldValues
              .filter(fv => fv.form_field?.filled_by === 'initiator' || !fv.form_field?.filled_by)
              .map(fv => (
                <div key={fv.id} className="grid grid-cols-5 gap-4 px-6 py-3 text-sm">
                  <span className="col-span-2 text-muted-foreground font-medium">{fv.form_field?.field_label}</span>
                  <span className="col-span-3 text-foreground break-words">
                    {fv.value || <span className="text-muted-foreground/40">—</span>}
                  </span>
                </div>
              ))}
          </div>
        )}
      </Card>

      {/* 4. Approver-assigned fields */}
      {isPending && myStep && (
        <ApproverFields
          fields={formFields}
          fieldValues={approverValues}
          myHierarchyLevel={myHierarchyLevel}
          onChange={setApproverField}
        />
      )}

      {/* 5. Action panel */}
      {isPending && myStep && (
        <Card>
          <CardHeader
            title="Your Decision"
            subtitle={myStep.step_label || `Step ${myStep.step_order}`}
          />
          <div className="p-6 space-y-5">

            {myStep.delegated_from && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400">
                You are acting on behalf of <strong>{myStep.delegated_from.name}</strong> under an active delegation.
              </div>
            )}

            <SignatureCapture value={signature} onChange={setSignature} />

            {/* Action buttons */}
            {!action && (
              <div className="flex flex-wrap gap-3 pt-1">
                <Button variant="success" onClick={() => { setAction('approve'); setError('') }}>
                  <Check size={15} /> Approve
                </Button>
                <Button variant="destructive" onClick={() => { setAction('reject'); setError('') }}>
                  <X size={15} /> Reject
                </Button>
                <Button variant="outline" onClick={() => { setAction('send_back'); setError('') }}>
                  <RotateCcw size={15} /> Send Back for Correction
                </Button>
              </div>
            )}

            {/* Confirmation flow */}
            {action && (
              <div className="space-y-4">
                <div className={cn('rounded-lg px-4 py-2.5 text-sm font-medium flex items-center gap-2', {
                  'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800': action === 'approve',
                  'bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800': action === 'reject',
                  'bg-orange-50 text-orange-800 border border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800': action === 'send_back',
                })}>
                  {action === 'approve'   && <><Check size={15} /> Approving this request</>}
                  {action === 'reject'    && <><X size={15} /> Rejecting this request — permanent, no appeal</>}
                  {action === 'send_back' && <><RotateCcw size={15} /> Returning to submitter from step 1</>}
                </div>

                <Textarea
                  label={`Notes${action !== 'approve' ? ' (required)' : ' (optional)'}`}
                  placeholder={
                    action === 'approve'   ? 'Add a comment for the record (optional)…' :
                    action === 'reject'    ? 'Explain why this request is being rejected…' :
                                            'Describe exactly what needs to be corrected…'
                  }
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                />

                {error && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2.5 text-sm text-destructive flex items-center gap-2">
                    <AlertCircle size={14} className="flex-shrink-0" /> {error}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleConfirm}
                    loading={mutation.isPending}
                    variant={action === 'approve' ? 'success' : action === 'reject' ? 'destructive' : 'default'}
                    className={action === 'send_back' ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
                  >
                    {action === 'approve'   ? 'Confirm Approval' :
                     action === 'reject'    ? 'Confirm Rejection' :
                                             'Confirm Send Back'}
                  </Button>
                  <Button variant="ghost" onClick={() => { setAction(null); setNotes(''); setError('') }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* No active step — view only */}
      {!isPending && (
        <div className="text-center py-8 bg-card rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">
            This form is <strong className="text-foreground">{instance.current_status}</strong> — no action required.
          </p>
        </div>
      )}
    </div>
  )
}
