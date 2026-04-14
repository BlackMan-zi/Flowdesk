import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getFormInstance } from '../api/forms'
import { adminCancelForm, adminSendBackForm, reassignStep } from '../api/approvals'
import { listUsers } from '../api/users'
import { useAuth } from '../context/AuthContext'
import Card, { CardHeader } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import {
  ChevronLeft, CheckCircle2, XCircle, Clock, RotateCcw,
  SkipForward, ShieldAlert, UserCog
} from 'lucide-react'

function StepIcon({ status, size = 18 }) {
  const map = {
    Approved:     <CheckCircle2 size={size} className="text-emerald-500" />,
    Rejected:     <XCircle size={size} className="text-red-500" />,
    Active:       <Clock size={size} className="text-amber-500" />,
    Waiting:      <Clock size={size} className="text-slate-300" />,
    'Sent Back':  <RotateCcw size={size} className="text-orange-500" />,
    Skipped:      <SkipForward size={size} className="text-slate-400" />,
  }
  return map[status] || <Clock size={size} className="text-slate-300" />
}

export default function FormDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { isObserver, isAdmin } = useAuth()

  // Admin override modal
  const [adminModal, setAdminModal] = useState(null) // 'cancel' | 'send-back' | null
  const [adminNotes, setAdminNotes] = useState('')
  const [adminError, setAdminError] = useState('')

  // Reassign modal
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignUserId, setReassignUserId] = useState('')
  const [reassignNotes, setReassignNotes] = useState('')
  const [reassignError, setReassignError] = useState('')

  const { data: instance, isLoading } = useQuery({
    queryKey: ['form-instance', id],
    queryFn: () => getFormInstance(id).then(r => r.data),
    refetchInterval: 10_000
  })

  // Only fetch users when admin (for reassign picker)
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
    },
    onError: (err) => setAdminError(err.response?.data?.detail || 'Action failed.')
  })

  const sendBackMutation = useMutation({
    mutationFn: () => adminSendBackForm(id, { notes: adminNotes }),
    onSuccess: () => {
      qc.invalidateQueries(['form-instance', id])
      qc.invalidateQueries(['form-instances'])
      setAdminModal(null)
      setAdminNotes('')
    },
    onError: (err) => setAdminError(err.response?.data?.detail || 'Action failed.')
  })

  const reassignMutation = useMutation({
    mutationFn: () => reassignStep(id, { new_approver_user_id: reassignUserId, notes: reassignNotes || null }),
    onSuccess: () => {
      qc.invalidateQueries(['form-instance', id])
      setReassignOpen(false)
      setReassignUserId('')
      setReassignNotes('')
    },
    onError: (err) => setReassignError(err.response?.data?.detail || 'Reassign failed.')
  })

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (!instance) return <p className="text-slate-500">Form not found.</p>

  const canResubmit  = instance.current_status === 'Returned for Correction'
  const isCompleted  = instance.current_status === 'Completed' || instance.current_status === 'Approved'
  const isTerminal   = ['Completed', 'Approved', 'Rejected'].includes(instance.current_status)
  const isUnderReview = ['Pending', 'Submitted'].includes(instance.current_status)

  const openAdminModal = (type) => { setAdminModal(type); setAdminNotes(''); setAdminError('') }
  const openReassign   = () => { setReassignOpen(true); setReassignUserId(''); setReassignNotes(''); setReassignError('') }

  const approvalSteps = (instance.versions?.[instance.current_version - 1]?.approval_instances || [])
    .slice()
    .sort((a, b) => a.step_order - b.step_order)

  const activeStep = approvalSteps.find(s => s.status === 'Active')

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">
              {instance.form_definition?.name || 'Form'}
            </h1>
            <Badge label={instance.current_status} />
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{instance.reference_number}</p>
        </div>
      </div>

      {/* Field values */}
      <Card>
        <CardHeader title="Form Data" subtitle={`Version ${instance.current_version}`} />
        <div className="p-6 space-y-3">
          {instance.versions?.[instance.current_version - 1]?.field_values?.map(fv => (
            <div key={fv.id} className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-slate-500 font-medium">{fv.form_field?.field_label}</span>
              <span className="text-slate-800">{fv.value || <span className="text-slate-400">—</span>}</span>
            </div>
          )) || (
            <p className="text-sm text-slate-400">No field data available.</p>
          )}
        </div>
      </Card>

      {/* Approval progress */}
      {approvalSteps.length > 0 && (
        <Card>
          <CardHeader title="Approval Progress" subtitle={`${approvalSteps.filter(s => s.status === 'Approved').length} of ${approvalSteps.length} steps done`} />
          <div className="p-6">
            <ol className="space-y-0">
              {approvalSteps.map((ap, i) => {
                const isActive  = ap.status === 'Active'
                const isDone    = ap.status === 'Approved'
                const isWaiting = ap.status === 'Waiting'

                return (
                  <li key={ap.id} className="flex items-stretch gap-3">
                    {/* Icon + connector */}
                    <div className="flex flex-col items-center w-5 shrink-0">
                      <div className={`mt-4 rounded-full ${isActive ? 'ring-2 ring-amber-300 ring-offset-1' : ''}`}>
                        <StepIcon status={ap.status} size={isActive ? 20 : 16} />
                      </div>
                      {i < approvalSteps.length - 1 && (
                        <div className={`w-px flex-1 min-h-4 mt-1 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                      )}
                    </div>

                    {/* Step body */}
                    <div className={`flex-1 mb-4 rounded-lg px-3 py-2.5 ${
                      isActive  ? 'bg-amber-50 border border-amber-200' :
                      isDone    ? 'bg-emerald-50/40' :
                      isWaiting ? 'opacity-50' : ''
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${isActive ? 'text-amber-900' : isDone ? 'text-emerald-900' : 'text-slate-500'}`}>
                            {ap.step_label || `Step ${ap.step_order}`}
                            {isActive && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">Current</span>}
                          </p>
                          {ap.approver && (
                            <p className={`text-xs mt-0.5 ${isActive ? 'text-amber-800 font-medium' : 'text-slate-500'}`}>
                              {ap.approver.name}
                              {ap.delegated_from && (
                                <span className="ml-1 text-slate-400">(delegated from {ap.delegated_from.name})</span>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge label={ap.status} />
                          {isAdmin && isActive && !isTerminal && (
                            <button
                              onClick={openReassign}
                              title="Reassign this step"
                              className="p-1 rounded hover:bg-amber-100 text-amber-700"
                            >
                              <UserCog size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {ap.notes && (
                        <p className="text-xs text-slate-600 mt-1.5 bg-white/70 rounded px-2 py-1 border border-slate-100">
                          "{ap.notes}"
                        </p>
                      )}
                      {ap.signed_at && (
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(ap.signed_at).toLocaleString()}
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

      {/* Actions — hidden for read-only roles */}
      {!isObserver && (
        <div className="flex gap-3 flex-wrap">
          {canResubmit && (
            <Button onClick={() => navigate(`/my-forms/${id}/resubmit`)}>
              Resubmit with Corrections
            </Button>
          )}
          {isCompleted && (
            <Button variant="secondary" onClick={() => navigate('/documents')}>
              Download PDF
            </Button>
          )}
        </div>
      )}

      {/* Admin override actions */}
      {isAdmin && !isTerminal && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={15} className="text-amber-600" />
            <p className="text-sm font-semibold text-amber-900">Admin Actions</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isUnderReview && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => openAdminModal('send-back')}
              >
                <RotateCcw size={13} className="mr-1.5" /> Send Back to Initiator
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openAdminModal('cancel')}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              <XCircle size={13} className="mr-1.5" /> Cancel Form
            </Button>
          </div>
        </div>
      )}

      {/* Admin override modal */}
      <Modal
        open={!!adminModal}
        onClose={() => setAdminModal(null)}
        title={adminModal === 'cancel' ? 'Cancel Form' : 'Send Back for Correction'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {adminModal === 'cancel'
              ? 'This will permanently cancel the form. The initiator will be notified.'
              : 'This will return the form to the initiator for editing. All pending approval steps will be cleared.'}
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {adminModal === 'cancel' ? 'Reason (optional)' : 'Reason *'}
            </label>
            <textarea
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              rows={3}
              placeholder={adminModal === 'cancel' ? 'e.g. Duplicate submission' : 'e.g. Missing supporting documents'}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {adminError && <p className="text-sm text-red-600">{adminError}</p>}
          <div className="flex gap-3">
            {adminModal === 'cancel' ? (
              <Button
                onClick={() => cancelMutation.mutate()}
                loading={cancelMutation.isPending}
                className="bg-red-600 hover:bg-red-700 border-red-600 text-white"
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
        </div>
      </Modal>

      {/* Reassign step modal */}
      <Modal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        title="Reassign Approval Step"
        size="sm"
      >
        <div className="space-y-4">
          {activeStep && (
            <p className="text-sm text-slate-600">
              Currently assigned to <strong>{activeStep.approver?.name || 'Unknown'}</strong> for step "{activeStep.step_label || `Step ${activeStep.step_order}`}".
              Select a new approver below.
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Approver *</label>
            <select
              value={reassignUserId}
              onChange={e => setReassignUserId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">— Select user —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason (optional)</label>
            <textarea
              value={reassignNotes}
              onChange={e => setReassignNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Original approver is on leave"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {reassignError && <p className="text-sm text-red-600">{reassignError}</p>}
          <div className="flex gap-3">
            <Button
              onClick={() => reassignMutation.mutate()}
              loading={reassignMutation.isPending}
              disabled={!reassignUserId}
            >
              Reassign
            </Button>
            <Button variant="secondary" onClick={() => setReassignOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
