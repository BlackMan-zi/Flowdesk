import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getInitiatorDashboard } from '../../api/dashboard'
import { useAuth } from '../../context/AuthContext'
import { Card, CardContent } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { SkeletonDashboard } from '../../components/ui/Skeleton'
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert'
import { Progress } from '../../components/ui/progress'
import { Separator } from '../../components/ui/separator'
import {
  AlertTriangle, Clock, CheckCircle2, XCircle, Plus,
  ChevronRight, FileText, ArrowRight,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts'

const STATUS_COLORS = {
  Pending:                   '#f59e0b',
  Completed:                 '#10b981',
  Approved:                  '#10b981',
  Rejected:                  '#ef4444',
  Draft:                     '#94a3b8',
  'Returned for Correction': '#f97316',
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function ChainProgress({ instance }) {
  const versions = instance.versions || []
  const currentVersion = versions[instance.current_version - 1]
  const steps = currentVersion?.approval_instances || []
  if (!steps.length) return null

  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order)
  const activeIdx = sorted.findIndex(s => s.status === 'Active')
  const total = sorted.filter(s => s.status !== 'Skipped').length
  const done = sorted.filter(s => s.status === 'Approved').length

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 mb-1">
        {sorted.filter(s => s.status !== 'Skipped').map((s, i) => (
          <div
            key={s.id || i}
            className={`flex-1 h-1.5 rounded-full transition-all ${
              s.status === 'Approved' ? 'bg-emerald-500' :
              s.status === 'Active'   ? 'bg-amber-400' :
              s.status === 'Rejected' ? 'bg-red-400' :
              'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {activeIdx >= 0
          ? `Step ${activeIdx + 1}/${total} · With ${sorted[activeIdx]?.step_label || `approver ${activeIdx + 1}`}`
          : done === total ? 'All approved' : '—'}
      </p>
    </div>
  )
}

function FormRow({ form, status, navigate }) {
  const needsAction = status === 'Returned for Correction'
  const isRejected  = status === 'Rejected'
  const isCompleted = status === 'Completed' || status === 'Approved'

  return (
    <button
      onClick={() => navigate(`/my-forms/${form.id}`)}
      className={`w-full flex items-start justify-between px-5 py-4 text-left transition-colors hover:bg-muted/30 border-l-2 ${
        needsAction ? 'border-orange-400' :
        isRejected  ? 'border-red-400' :
        isCompleted ? 'border-emerald-400' :
        status === 'Pending' ? 'border-amber-400' :
        'border-transparent'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{form.form_name}</p>
          {needsAction && <AlertTriangle size={12} className="text-orange-500 flex-shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 font-mono">{form.reference_number}</p>
        <ChainProgress instance={form} />
      </div>
      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
        <Badge label={status === 'Pending' ? 'In Progress' : status} />
        <ChevronRight size={13} className="text-muted-foreground/40" />
      </div>
    </button>
  )
}

export default function InitiatorDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'initiator'],
    queryFn: () => getInitiatorDashboard().then(r => r.data),
    refetchInterval: 30_000,
  })

  if (isLoading) return <SkeletonDashboard />

  const byStatus  = data?.by_status || {}
  const summary   = data?.summary || {}
  const returned  = byStatus['Returned for Correction'] || []
  const pending   = byStatus['Pending'] || []
  const rejected  = byStatus['Rejected'] || []
  const completed = byStatus['Completed'] || []
  const drafts    = byStatus['Draft'] || []

  const allForms = Object.entries(byStatus)
    .flatMap(([status, items]) => items.map(f => ({ ...f, _status: status })))
    .sort((a, b) => {
      const priority = { 'Returned for Correction': 0, Pending: 1, Rejected: 2, Draft: 3, Completed: 4 }
      return (priority[a._status] ?? 9) - (priority[b._status] ?? 9)
    })

  const pieData = [
    { name: 'In Progress', value: summary.pending   || 0, color: STATUS_COLORS.Pending },
    { name: 'Completed',   value: summary.completed || 0, color: STATUS_COLORS.Completed },
    { name: 'Rejected',    value: summary.rejected  || 0, color: STATUS_COLORS.Rejected },
    { name: 'Draft',       value: summary.draft     || 0, color: STATUS_COLORS.Draft },
  ].filter(d => d.value > 0)

  const total = Object.values(summary).reduce((s, v) => s + (v || 0), 0)
  const completedPct = total > 0 ? Math.round(((summary.completed || 0) / total) * 100) : 0

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }
  const firstName = user?.name?.split(' ')[0] || 'there'

  return (
    <div className="max-w-3xl space-y-5">

      {/* Welcome */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{greeting()}, {firstName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Here's the status of your requests.</p>
        </div>
        <Button onClick={() => navigate('/my-forms/new')} className="flex-shrink-0">
          <Plus size={14} /> New Request
        </Button>
      </div>

      {/* Correction alert */}
      {returned.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{returned.length} request{returned.length > 1 ? 's' : ''} need your attention</AlertTitle>
          <AlertDescription>
            <div className="space-y-2 mt-2">
              {returned.map(f => (
                <button
                  key={f.id}
                  onClick={() => navigate(`/my-forms/${f.id}`)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-background rounded-lg border border-amber-200 hover:border-amber-400 text-left transition-all group"
                >
                  <div>
                    <span className="text-sm font-semibold text-foreground">{f.form_name}</span>
                    <p className="text-xs text-muted-foreground font-mono">{f.reference_number}</p>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-orange-600 font-semibold">
                    Fix & resubmit <ArrowRight size={11} />
                  </span>
                </button>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* KPI cards + donut */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'In Progress', value: summary.pending,   icon: Clock,        colorClass: 'bg-amber-50 dark:bg-amber-950 text-amber-600',   accent: 'bg-amber-400' },
            { label: 'Completed',   value: summary.completed, icon: CheckCircle2, colorClass: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600', accent: 'bg-emerald-400' },
            { label: 'Rejected',    value: summary.rejected,  icon: XCircle,      colorClass: 'bg-red-50 dark:bg-red-950 text-red-500',          accent: 'bg-red-400' },
            { label: 'Draft',       value: summary.draft,     icon: FileText,     colorClass: 'bg-muted text-muted-foreground',                  accent: 'bg-muted-foreground/30' },
          ].map(({ label, value, icon: Icon, colorClass, accent }) => (
            <Card key={label} className="relative overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent}`} />
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colorClass}`}>
                  <Icon size={16} />
                </div>
                <p className="text-2xl font-bold text-foreground leading-none">{value ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1.5 font-medium">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Donut + completion */}
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-foreground mb-1">Request Overview</p>
            <p className="text-xs text-muted-foreground mb-3">{total} total requests</p>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend formatter={(v) => <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[150px]">
                <p className="text-sm text-muted-foreground">No data yet</p>
              </div>
            )}
            <Separator className="my-3" />
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Completion rate</span>
                <span className="font-semibold text-foreground">{completedPct}%</span>
              </div>
              <Progress value={completedPct} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All requests */}
      {allForms.length > 0 ? (
        <Card>
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">All Requests</p>
            <Button variant="ghost" size="sm" onClick={() => navigate('/my-forms')} className="h-7 px-2 text-xs text-primary">
              View all <ChevronRight size={12} />
            </Button>
          </div>
          <div className="divide-y divide-border">
            {allForms.slice(0, 10).map(f => (
              <FormRow key={f.id} form={f} status={f._status} navigate={navigate} />
            ))}
          </div>
          {allForms.length > 10 && (
            <div className="px-5 py-3 border-t border-border text-center">
              <Button variant="ghost" size="sm" onClick={() => navigate('/my-forms')} className="text-primary text-xs">
                View {allForms.length - 10} more →
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <FileText size={28} className="text-primary/60" />
          </div>
          <h3 className="text-base font-bold text-foreground">No requests yet</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto">
            Start by submitting your first request to kick off the approval process
          </p>
          <Button className="mt-5" onClick={() => navigate('/my-forms/new')}>
            <Plus size={14} /> Submit your first request
          </Button>
        </div>
      )}
    </div>
  )
}
