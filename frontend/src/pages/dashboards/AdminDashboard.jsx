import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getAdminDashboard } from '../../api/dashboard'
import { getPendingApprovals } from '../../api/approvals'
import { useAuth } from '../../context/AuthContext'
import Card, { CardHeader } from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import {
  Activity, Clock, CheckCircle2, XCircle, AlertTriangle,
  Users, FormInput, GitBranch, RotateCcw, Activity as LogsIcon
} from 'lucide-react'

// ── Simple SVG donut chart ────────────────────────────────────────────────────

function DonutChart({ segments, size = 110, thickness = 22 }) {
  const r = (size - thickness) / 2
  const cx = size / 2
  const circumference = 2 * Math.PI * r
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0)
  if (!total) return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth={thickness} />
    </svg>
  )

  let offset = 0
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      {segments.map((seg, i) => {
        const pct = seg.value / total
        const dash = pct * circumference
        const el = (
          <circle
            key={i}
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset * circumference}
            strokeLinecap="butt"
          />
        )
        offset += pct
        return el
      })}
    </svg>
  )
}

// ── Horizontal bar chart ──────────────────────────────────────────────────────

function BarChart({ bars }) {
  const max = Math.max(...bars.map(b => b.value || 0), 1)
  return (
    <div className="space-y-2.5">
      {bars.map(bar => (
        <div key={bar.label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-600">{bar.label}</span>
            <span className="text-xs font-semibold text-slate-800">{bar.value}</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(bar.value / max) * 100}%`, backgroundColor: bar.color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, icon: Icon, color, alert }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600',
    amber:  'bg-amber-50 text-amber-600',
    green:  'bg-emerald-50 text-emerald-600',
    red:    'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    slate:  'bg-slate-100 text-slate-600',
  }
  return (
    <Card className={`p-5 ${alert ? 'ring-2 ring-orange-300' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon size={18} />
        </div>
        {alert && <AlertTriangle size={14} className="text-orange-500" />}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value ?? 0}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </Card>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: adminData, isLoading } = useQuery({
    queryKey: ['dashboard', 'admin'],
    queryFn: () => getAdminDashboard().then(r => r.data),
    refetchInterval: 60_000
  })

  const { data: myPending = [] } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => getPendingApprovals().then(r => r.data),
    refetchInterval: 30_000
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>

  const s     = adminData?.by_status || {}
  const forms = adminData?.forms || []

  const pending   = s['Pending'] || 0
  const completed = (s['Completed'] || 0) + (s['Approved'] || 0)
  const rejected  = s['Rejected'] || 0
  const draft     = s['Draft'] || 0
  const returned  = s['Returned for Correction'] || 0

  const stuckForms = forms.filter(f =>
    f.status === 'Pending' && f.submitted_at &&
    (Date.now() - new Date(f.submitted_at)) > 3 * 24 * 60 * 60 * 1000
  )

  const donutSegments = [
    { label: 'Pending',   value: pending,   color: '#f59e0b' },
    { label: 'Completed', value: completed, color: '#10b981' },
    { label: 'Rejected',  value: rejected,  color: '#ef4444' },
    { label: 'Draft',     value: draft,     color: '#94a3b8' },
    { label: 'Returned',  value: returned,  color: '#f97316' },
  ].filter(s => s.value > 0)

  const barData = [
    { label: 'Pending approval', value: pending,   color: '#f59e0b' },
    { label: 'Completed',        value: completed, color: '#10b981' },
    { label: 'Draft',            value: draft,     color: '#94a3b8' },
    { label: 'Returned',         value: returned,  color: '#f97316' },
    { label: 'Rejected',         value: rejected,  color: '#ef4444' },
  ]

  return (
    <div className="max-w-5xl space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">System Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Organisation-wide workflow health at a glance.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => navigate('/logs')}>
          <LogsIcon size={13} className="mr-1.5" /> View Logs
        </Button>
      </div>

      {/* Alerts */}
      {myPending.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-amber-600" />
            <p className="text-sm font-medium text-amber-900">
              You have {myPending.length} approval{myPending.length > 1 ? 's' : ''} waiting for your decision
            </p>
          </div>
          <Button size="sm" onClick={() => navigate('/approvals')}>Review now</Button>
        </div>
      )}

      {stuckForms.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-orange-600" />
            <p className="text-sm font-medium text-orange-900">
              {stuckForms.length} form{stuckForms.length > 1 ? 's' : ''} pending for more than 3 days
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => navigate('/my-forms')}>Investigate</Button>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Total Active"      value={adminData?.total_forms} icon={Activity}    color="blue" />
        <MetricCard label="Pending Approval"  value={pending}                icon={Clock}        color="amber" alert={stuckForms.length > 0} />
        <MetricCard label="Completed"         value={completed}              icon={CheckCircle2} color="green" />
        <MetricCard label="Rejected"          value={rejected}               icon={XCircle}      color="red" />
      </div>

      {/* Analytics charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Donut — distribution */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Request Distribution</h3>
          <div className="flex items-center gap-6">
            <div className="relative flex-shrink-0">
              <DonutChart segments={donutSegments} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xl font-bold text-slate-900">{adminData?.total_forms || 0}</p>
                <p className="text-xs text-slate-400">total</p>
              </div>
            </div>
            <div className="space-y-2 flex-1">
              {donutSegments.map(seg => (
                <div key={seg.label} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                  <span className="text-xs text-slate-600 flex-1">{seg.label}</span>
                  <span className="text-xs font-semibold text-slate-800">{seg.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Bar — breakdown */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Status Breakdown</h3>
          <BarChart bars={barData} />
          {adminData?.correction_cycles > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
              <RotateCcw size={13} className="text-orange-500" />
              <p className="text-xs text-slate-600">
                <span className="font-semibold text-orange-600">{adminData.correction_cycles}</span> forms required corrections (sent back ≥ once)
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Recent submissions + config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <Card>
          <CardHeader
            title="Recent Submissions"
            action={
              <button onClick={() => navigate('/my-forms')} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
                All <ChevronRight size={11} />
              </button>
            }
          />
          <div className="divide-y divide-slate-100">
            {forms.slice(0, 8).map(f => (
              <div key={f.id} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{f.form_name}</p>
                  <p className="text-xs text-slate-400">{f.initiator} · {f.reference_number}</p>
                </div>
                <Badge label={f.status} />
              </div>
            ))}
            {forms.length === 0 && (
              <p className="px-5 py-6 text-sm text-slate-400 text-center">No forms yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Configuration" />
          <div className="divide-y divide-slate-100">
            {[
              { label: 'Manage Users',        icon: Users,     to: '/admin/users' },
              { label: 'Form Definitions',    icon: FormInput, to: '/admin/form-definitions' },
              { label: 'Approval Templates',  icon: GitBranch, to: '/admin/approval-templates' },
              { label: 'Activity Logs',       icon: LogsIcon,  to: '/logs' },
            ].map(({ label, icon: Icon, to }) => (
              <button key={to} onClick={() => navigate(to)}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 text-sm text-left transition-colors">
                <Icon size={15} className="text-slate-400" />
                <span className="text-slate-700 font-medium flex-1">{label}</span>
                <ChevronRight size={13} className="text-slate-300" />
              </button>
            ))}
          </div>
        </Card>

      </div>
    </div>
  )
}

function ChevronRight({ size, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
