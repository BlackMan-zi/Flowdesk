import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getReportManagerDashboard } from '../../api/dashboard'
import { useAuth } from '../../context/AuthContext'
import Card, { CardHeader } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import { Clock, CheckCircle2, XCircle, RotateCcw, Users, Plus, ChevronRight, AlertTriangle } from 'lucide-react'

function StatCard({ label, value, color, icon: Icon }) {
  const colors = {
    amber:   'bg-amber-50 text-amber-600',
    green:   'bg-emerald-50 text-emerald-600',
    red:     'bg-red-50 text-red-600',
    orange:  'bg-orange-50 text-orange-600',
    slate:   'bg-slate-100 text-slate-500',
    blue:    'bg-blue-50 text-blue-600',
  }
  return (
    <Card className="p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colors[color]}`}>
        <Icon size={16} />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value ?? 0}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </Card>
  )
}

export default function ReportManagerDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'report-manager'],
    queryFn: () => getReportManagerDashboard().then(r => r.data),
    refetchInterval: 60_000
  })

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'morning'
    if (h < 18) return 'afternoon'
    return 'evening'
  }

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>

  const s = data?.by_status || {}
  const pending   = s['Pending'] || 0
  const completed = (s['Completed'] || 0) + (s['Approved'] || 0)
  const rejected  = s['Rejected'] || 0
  const returned  = s['Returned for Correction'] || 0
  const draft     = s['Draft'] || 0
  const recentForms = data?.recent_forms || []

  return (
    <div className="max-w-4xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Good {greeting()}, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data?.department_name
              ? <>Department: <span className="font-medium text-slate-700">{data.department_name}</span></>
              : 'Department overview'
            }
          </p>
        </div>
        <Button onClick={() => navigate('/my-forms/new')}>
          <Plus size={15} className="mr-1.5" /> New Request
        </Button>
      </div>

      {/* Pending approvals alert */}
      {data?.my_pending_count > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-amber-600" />
            <p className="text-sm font-medium text-amber-900">
              You have {data.my_pending_count} approval{data.my_pending_count > 1 ? 's' : ''} waiting for your decision
            </p>
          </div>
          <Button size="sm" onClick={() => navigate('/approvals')}>Review now</Button>
        </div>
      )}

      {/* Dept stats */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">
            {data?.department_name || 'Department'} — {data?.department_user_count || 0} members · {data?.direct_report_count || 0} direct reports
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Pending"   value={pending}   color="amber"  icon={Clock} />
          <StatCard label="Completed" value={completed} color="green"  icon={CheckCircle2} />
          <StatCard label="Rejected"  value={rejected}  color="red"    icon={XCircle} />
          <StatCard label="Returned"  value={returned}  color="orange" icon={RotateCcw} />
        </div>
      </div>

      {/* Recent dept forms */}
      <Card>
        <CardHeader
          title="Department Requests"
          subtitle={`${data?.total_dept_forms || 0} total`}
          action={
            <button onClick={() => navigate('/my-forms')} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              My own <ChevronRight size={11} />
            </button>
          }
        />
        {recentForms.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">No forms submitted in your department yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentForms.map(f => (
              <div key={f.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{f.form_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{f.initiator} · {f.reference_number}</p>
                </div>
                <Badge label={f.status} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Direct reports */}
      {data?.direct_reports?.length > 0 && (
        <Card>
          <CardHeader title="Direct Reports" subtitle={`${data.direct_reports.length} people`} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100 rounded-b-xl overflow-hidden">
            {data.direct_reports.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3 bg-white">
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                  {u.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
