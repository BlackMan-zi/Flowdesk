import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getPendingApprovals } from '../../api/approvals'
import { useAuth } from '../../context/AuthContext'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import { CheckCircle2, ChevronRight } from 'lucide-react'

export default function ExecutiveDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => getPendingApprovals().then(r => r.data),
    refetchInterval: 30_000
  })

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  )

  // Completely stripped — only what requires a decision
  return (
    <div className="max-w-lg mx-auto pt-12 space-y-6">

      {/* Identity */}
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-brand-600 flex items-center justify-center text-white text-lg font-bold mx-auto mb-3">
          {user?.name?.[0]?.toUpperCase()}
        </div>
        <p className="text-sm text-slate-500">{user?.name}</p>
        <p className="text-xs text-slate-400">{user?.roles?.[0]}</p>
      </div>

      {/* The one question */}
      {pending.length === 0 ? (
        <div className="text-center bg-emerald-50 border border-emerald-200 rounded-2xl p-10">
          <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3" />
          <p className="text-lg font-semibold text-emerald-900">Nothing requires your attention</p>
          <p className="text-sm text-emerald-700 mt-1">All approvals are up to date.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-center mb-6">
            <p className="text-3xl font-bold text-slate-900">{pending.length}</p>
            <p className="text-sm text-slate-500 mt-1">
              {pending.length === 1 ? 'decision requires' : 'decisions require'} your attention
            </p>
          </div>

          {pending.map(item => (
            <button
              key={item.approval_instance_id}
              onClick={() => navigate(`/approvals/${item.form_instance_id}`)}
              className="w-full flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-brand-400 hover:shadow-sm transition-all text-left"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.form_name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  From {item.initiator} · {item.reference_number}
                </p>
                {item.step_label && (
                  <p className="text-xs text-brand-600 mt-1 font-medium">{item.step_label}</p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4">
                <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">
                  Awaiting you
                </span>
                <ChevronRight size={16} className="text-slate-400" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
