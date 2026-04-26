import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getFormInstance } from '../api/forms'
import { adminCancelForm, adminSendBackForm, reassignStep } from '../api/approvals'
import { listUsers } from '../api/users'
import { useAuth } from '../context/AuthContext'
import Card, { CardHeader } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { SkeletonFormDetail } from '../components/ui/Skeleton'
import { Select, Textarea } from '../components/ui/Input'
import {
  ChevronLeft, CheckCircle2, XCircle, Clock, RotateCcw,
  SkipForward, ShieldAlert, UserCog, Hash, User, Calendar,
  FileText, AlertCircle
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
  const { isObserver, isAdmin } = useAuth()

  const [adminModal, setAdminModal] = useState(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignUserId, setReassignUserId] = useState('')
  const [reassignNotes, setReassignNotes] = useState('')

  const { data: instance, isLoading } = useQuery({
    queryKey: ['form-instance', id],
    queryFn: () => getFormInstance(id).then(r => r.data),
    refetchInterval: 10_000
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers().then(r => r.data),
    enabled: isAdmin,
    staleTime: 60_000
  })

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
  const isTerminal    = ['Completed', 'Approved', 'Rejected'].includes(instance.current_status)
  const isUnderReview = ['Pending', 'Submitted'].includes(instance.current_status)

  const openAdminModal = (type) => { setAdminModal(type); setAdminNotes('') }
  const openReassign   = () => { setReassignOpen(true); setReassignUserId(''); setReassignNotes('') }

  const approvalSteps = (instance.versions?.[instance.current_version - 1]?.approval_instances || [])
    .slice().sort((a, b) => a.step_order - b.step_order)
  const activeStep = approvalSteps.find(s => s.status === 'Active')

  const fieldValues = instance.versions?.[instance.current_version - 1]?.field_values || []

  return (
    <div className="max-w-2xl space-y-4">

      {/* Header */}
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
      </div>

      {/* Returned alert */}
      {canResubmit && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-orange-900">Action required</p>
            <p className="text-xs text-orange-700 mt-0.5">This form was returned for correction. Review the feedback, make your changes, and resubmit.</p>
          </div>
          <Button size="sm" onClick={() => navigate(`/my-forms/${id}/resubmit`)}>
            Correct & Resubmit
          </Button>
        </div>
      )}

      {/* Approval progress bar */}
      {approvalSteps.length > 0 && (
        <ApprovalProgressBar steps={approvalSteps} />
      )}

      {/* Field values */}
      <Card>
        <CardHeader
          title="Form Data"
          subtitle={`Version ${instance.current_version}${instance.current_version > 1 ? ' (revised)' : ''}`}
        />
        <div className="divide-y divide-slate-50">
          {fieldValues.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-400 text-center">No field data available.</p>
          ) : fieldValues.map(fv => (
            <div key={fv.id} className="grid grid-cols-5 gap-4 px-6 py-3.5 text-sm hover:bg-slate-50/50">
              <span className="col-span-2 text-slate-500 font-medium text-xs uppercase tracking-wide">
                {fv.form_field?.field_label}
              </span>
              <span className="col-span-3 text-slate-800 font-medium break-words">
                {fv.value || <span className="text-slate-300 font-normal">—</span>}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Approval step timeline */}
      {approvalSteps.length > 0 && (
        <Card>
          <CardHeader
            title="Approval Chain"
            subtitle={`${approvalSteps.filter(s => s.status === 'Approved').length} of ${approvalSteps.length} steps completed`}
          />
          <div className="px-5 py-4">
            <ol className="space-y-0">
              {approvalSteps.map((ap, i) => {
                const isActive  = ap.status === 'Active'
                const isDone    = ap.status === 'Approved'
                const isWaiting = ap.status === 'Waiting'

                return (
                  <li key={ap.id} className="flex items-stretch gap-4">
                    {/* Icon + connector */}
                    <div className="flex flex-col items-center w-9 flex-shrink-0">
                      <div className="mt-2.5">
                        <StepIcon status={ap.status} />
                      </div>
                      {i < approvalSteps.length - 1 && (
                        <div className={`w-0.5 flex-1 min-h-6 my-1 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                      )}
                    </div>

                    {/* Step body */}
                    <div className={`flex-1 mb-4 rounded-xl px-4 py-3 ${
                      isActive  ? 'bg-amber-50 border border-amber-200' :
                      isDone    ? 'bg-emerald-50/40 border border-emerald-100' :
                      isWaiting ? 'opacity-50 bg-slate-50 border border-slate-100' :
                                  'bg-slate-50 border border-slate-100'
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-bold ${
                              isActive ? 'text-amber-900' : isDone ? 'text-emerald-900' : 'text-slate-500'
                            }`}>
                              {ap.step_label || `Step ${ap.step_order}`}
                            </p>
                            {isActive && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                                Current
                              </span>
                            )}
                          </div>
                          {ap.approver && (
                            <p className={`text-xs mt-0.5 ${isActive ? 'text-amber-800 font-semibold' : 'text-slate-400'}`}>
                              {ap.approver.name}
                              {ap.delegated_from && (
                                <span className="ml-1 font-normal text-slate-400">
                                  (delegated from {ap.delegated_from.name})
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge label={ap.status} />
                          {isAdmin && isActive && !isTerminal && (
                            <button
                              onClick={openReassign}
                              title="Reassign this step"
                              className="w-7 h-7 rounded-lg hover:bg-amber-100 text-amber-700 flex items-center justify-center transition-colors"
                            >
                              <UserCog size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {ap.notes && (
                        <p className="text-xs text-slate-600 mt-2 bg-white/80 rounded-lg px-3 py-2 border border-slate-100 italic">
                          "{ap.notes}"
                        </p>
                      )}
                      {ap.signed_at && (
                        <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                          <Calendar size={10} />
                          {new Date(ap.signed_at).toLocaleString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
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
            <Button onClick={() => navigate(`/my-forms/${id}/resubmit`)}>
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
            <option value="">— Select user —</option>
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
