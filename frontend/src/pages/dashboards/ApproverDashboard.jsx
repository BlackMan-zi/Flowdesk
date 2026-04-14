import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getApproverDashboard } from '../../api/dashboard'
import { useAuth } from '../../context/AuthContext'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import { CheckSquare, Clock, CheckCircle2, XCircle, ChevronRight, ArrowRight } from 'lucide-react'

function PendingCard({ item, onReview }) {
  return (
    <div className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
      <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Clock size={16} className="text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">{item.form_name}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          From {item.initiator} · {item.reference_number}
        </p>
        {item.step_label && (
          <span className="inline-flex items-center mt-1.5 text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
            {item.step_label}
          </span>
        )}
        {item.delegated_from && (
          <p className="text-xs text-slate-400 mt-1">Delegated from {item.delegated_from}</p>
        )}
      </div>
      <Button
        size="sm"
        onClick={() => onReview(item.form_instance_id)}
        className="flex-shrink-0 mt-0.5"
      >
        Review <ChevronRight size={13} />
      </Button>
    </div>
  )
}

export default function ApproverDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'approver'],
    queryFn: () => getApproverDashboard().then(r => r.data),
    refetchInterval: 30_000
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>

  const pending = data?.pending || []
  const counts  = data?.counts || {}
  const recentApproved = data?.approved_by_me || []

  return (
    <div className="max-w-2xl space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Approval Queue</h1>
        <p className="text-sm text-slate-500 mt-0.5">Requests waiting for your decision.</p>
      </div>

      {/* Big pending count */}
      <div className={`rounded-xl p-5 border ${
        pending.length > 0
          ? 'bg-amber-50 border-amber-200'
          : 'bg-emerald-50 border-emerald-200'
      }`}>
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold font-mono ${
            pending.length > 0 ? 'bg-amber-400 text-white' : 'bg-emerald-400 text-white'
          }`}>
            {pending.length}
          </div>
          <div>
            <p className={`text-base font-semibold ${pending.length > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
              {pending.length === 0
                ? 'Queue is clear'
                : pending.length === 1
                  ? '1 approval waiting for you'
                  : `${pending.length} approvals waiting for you`
              }
            </p>
            <p className={`text-sm mt-0.5 ${pending.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {pending.length > 0
                ? 'Review and decide before your next check-in'
                : 'Nothing pending — all clear'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Pending list */}
      {pending.length > 0 && (
        <Card>
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">Needs Your Decision</h2>
          </div>
          {pending.map(item => (
            <PendingCard
              key={item.approval_instance_id}
              item={item}
              onReview={(id) => navigate(`/approvals/${id}`)}
            />
          ))}
        </Card>
      )}

      {/* Summary counts */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 size={18} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{counts.approved ?? 0}</p>
            <p className="text-xs text-slate-500">Approved by me</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
            <XCircle size={18} className="text-red-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{counts.rejected ?? 0}</p>
            <p className="text-xs text-slate-500">Rejected by me</p>
          </div>
        </Card>
      </div>

      {/* Recent history (secondary) */}
      {recentApproved.length > 0 && (
        <Card>
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Recently Approved</h2>
            <button
              onClick={() => navigate('/approvals/history')}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
            >
              View all <ArrowRight size={11} />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentApproved.slice(0, 5).map(item => (
              <div key={item.approval_instance_id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{item.form_name}</p>
                  <p className="text-xs text-slate-400">{item.reference_number}</p>
                </div>
                <span className="text-xs text-emerald-600 font-medium">Approved</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
