import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getInitiatorDashboard } from '../../api/dashboard'
import { useAuth } from '../../context/AuthContext'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import { AlertTriangle, Clock, CheckCircle2, XCircle, Plus, ChevronRight } from 'lucide-react'

function ChainProgress({ instance }) {
  // Show approval chain position inline if we have version data
  const versions = instance.versions || []
  const currentVersion = versions[instance.current_version - 1]
  const steps = currentVersion?.approval_instances || []
  if (!steps.length) return null

  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order)
  const activeIdx = sorted.findIndex(s => s.status === 'Active')
  const total = sorted.filter(s => s.status !== 'Skipped').length
  const done = sorted.filter(s => s.status === 'Approved').length

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex items-center gap-1">
        {sorted.filter(s => s.status !== 'Skipped').map((s, i) => (
          <div
            key={s.id || i}
            className={`w-2 h-2 rounded-full ${
              s.status === 'Approved' ? 'bg-emerald-500' :
              s.status === 'Active'   ? 'bg-amber-400 ring-2 ring-amber-200' :
              s.status === 'Rejected' ? 'bg-red-400' :
              'bg-slate-200'
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-slate-400">
        {activeIdx >= 0
          ? `With ${sorted[activeIdx]?.step_label || `approver ${activeIdx + 1}`}`
          : done === total ? 'All approved' : '—'
        }
      </span>
    </div>
  )
}

function FormCard({ form, status, navigate }) {
  const needsAction = status === 'Returned for Correction'
  const isRejected = status === 'Rejected'

  return (
    <div
      onClick={() => navigate(`/my-forms/${form.id}`)}
      className={`flex items-start justify-between px-4 py-3.5 cursor-pointer transition-colors hover:bg-slate-50 border-l-2 ${
        needsAction ? 'border-orange-400 bg-orange-50 hover:bg-orange-50' :
        isRejected  ? 'border-red-200' : 'border-transparent'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-800 truncate">{form.form_name}</p>
          {needsAction && <AlertTriangle size={13} className="text-orange-500 flex-shrink-0" />}
        </div>
        <p className="text-xs text-slate-400 mt-0.5">{form.reference_number}</p>
        <ChainProgress instance={form} />
      </div>
      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
        <Badge label={status} />
        <ChevronRight size={14} className="text-slate-300" />
      </div>
    </div>
  )
}

export default function InitiatorDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'initiator'],
    queryFn: () => getInitiatorDashboard().then(r => r.data),
    refetchInterval: 30_000
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>

  const byStatus = data?.by_status || {}
  const summary  = data?.summary || {}
  const returned = byStatus['Returned for Correction'] || []
  const pending  = byStatus['Pending'] || []
  const rejected = byStatus['Rejected'] || []
  const completed = byStatus['Completed'] || []
  const drafts   = byStatus['Draft'] || []

  const allForms = Object.entries(byStatus)
    .flatMap(([status, items]) => items.map(f => ({ ...f, _status: status })))
    .sort((a, b) => {
      const priority = { 'Returned for Correction': 0, 'Pending': 1, 'Rejected': 2, 'Draft': 3, 'Completed': 4 }
      return (priority[a._status] ?? 9) - (priority[b._status] ?? 9)
    })

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'morning'
    if (h < 18) return 'afternoon'
    return 'evening'
  }

  return (
    <div className="max-w-3xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Good {greeting()}, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Here's the status of your requests.</p>
        </div>
        <Button onClick={() => navigate('/my-forms/new')}>
          <Plus size={15} /> New Request
        </Button>
      </div>

      {/* Correction alert — most prominent if any exist */}
      {returned.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-orange-600" />
            <p className="text-sm font-semibold text-orange-800">
              {returned.length} request{returned.length > 1 ? 's' : ''} returned for your correction
            </p>
          </div>
          <div className="space-y-1">
            {returned.map(f => (
              <button
                key={f.id}
                onClick={() => navigate(`/my-forms/${f.id}`)}
                className="w-full flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-orange-200 hover:border-orange-400 text-left text-sm transition-colors"
              >
                <span className="font-medium text-slate-800">{f.form_name}</span>
                <span className="text-xs text-orange-600 font-medium">Correct & resubmit →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Pending',   value: summary.pending,    icon: Clock,         color: 'text-amber-600  bg-amber-50' },
          { label: 'Completed', value: summary.completed,  icon: CheckCircle2,  color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Rejected',  value: summary.rejected,   icon: XCircle,       color: 'text-red-500     bg-red-50' },
          { label: 'Draft',     value: summary.draft,      icon: Plus,          color: 'text-slate-500   bg-slate-100' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
              <Icon size={16} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{value ?? 0}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      {/* Full request list */}
      <Card>
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">All Requests</h2>
          <span className="text-xs text-slate-400">{allForms.length} total</span>
        </div>
        {allForms.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-slate-400 text-sm">No requests yet.</p>
            <Button className="mt-4" size="sm" onClick={() => navigate('/my-forms/new')}>
              Submit your first request
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {allForms.map(f => (
              <FormCard key={f.id} form={f} status={f._status} navigate={navigate} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
