import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getApproverDashboard } from '../../api/dashboard'
import { useAuth } from '../../context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { SkeletonDashboard } from '../../components/ui/Skeleton'
import { Alert, AlertTitle } from '../../components/ui/alert'
import { Badge } from '../../components/ui/Badge'
import {
  Clock, CheckCircle2, XCircle, ChevronRight, ArrowRight, AlertTriangle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill || p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function PendingCard({ item, onReview }) {
  const isUrgent  = item.days_waiting >= 5
  const isWarning = item.days_waiting >= 3 && item.days_waiting < 5

  return (
    <div className={`flex items-start gap-4 px-5 py-4 hover:bg-muted/30 transition-colors border-b border-border last:border-0 ${
      isUrgent ? 'bg-red-50/50 dark:bg-red-950/20' : isWarning ? 'bg-orange-50/30 dark:bg-orange-950/10' : ''
    }`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
        isUrgent  ? 'bg-red-100 dark:bg-red-950'    :
        isWarning ? 'bg-orange-100 dark:bg-orange-950' :
                    'bg-amber-100 dark:bg-amber-950'
      }`}>
        {isUrgent ? (
          <AlertTriangle size={17} className="text-red-600 dark:text-red-400" />
        ) : (
          <Clock size={17} className={isWarning ? 'text-orange-600 dark:text-orange-400' : 'text-amber-600 dark:text-amber-400'} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground">{item.form_name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          From <span className="font-semibold text-foreground">{item.initiator}</span> ·{' '}
          <span className="font-mono">{item.reference_number}</span>
        </p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {item.step_label && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-semibold">
              {item.step_label}
            </span>
          )}
          {item.days_waiting != null && (
            <span className={`text-xs font-semibold ${
              isUrgent ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-muted-foreground'
            }`}>
              {item.days_waiting === 0 ? 'Received today' : `${item.days_waiting}d waiting`}
              {isUrgent ? ' — overdue' : ''}
            </span>
          )}
          {item.delegated_from && (
            <span className="text-xs text-amber-600 font-medium">Delegated from {item.delegated_from}</span>
          )}
        </div>
      </div>
      <Button size="sm" onClick={() => onReview(item.form_instance_id)} className="flex-shrink-0 mt-0.5">
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
    refetchInterval: 30_000,
  })

  if (isLoading) return <SkeletonDashboard />

  const pending        = data?.pending || []
  const counts         = data?.counts  || {}
  const recentApproved = data?.approved_by_me || []

  const urgentCount  = pending.filter(p => p.days_waiting >= 5).length
  const warningCount = pending.filter(p => p.days_waiting >= 3 && p.days_waiting < 5).length

  const decisionData = [
    { name: 'Approved', value: counts.approved ?? 0, fill: '#10b981' },
    { name: 'Rejected', value: counts.rejected ?? 0, fill: '#ef4444' },
    { name: 'Pending',  value: pending.length,        fill: '#f59e0b' },
  ]

  return (
    <div className="max-w-3xl space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Approval Queue</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Requests waiting for your decision
          {pending.length > 0 && (
            <Badge className="ml-2 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-0">
              {pending.length}
            </Badge>
          )}
        </p>
      </div>

      {/* Alerts */}
      {urgentCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{urgentCount} overdue approval{urgentCount > 1 ? 's' : ''} require immediate attention</AlertTitle>
        </Alert>
      )}

      {/* Queue status card */}
      <Card className={pending.length > 0 ? 'border-amber-200 dark:border-amber-800' : 'border-emerald-200 dark:border-emerald-800'}>
        <CardContent className="p-6">
          <div className="flex items-center gap-5">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0 ${
              pending.length > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
            }`}>
              {pending.length}
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">
                {pending.length === 0 ? 'Queue is clear' :
                 pending.length === 1 ? '1 approval awaiting you' :
                 `${pending.length} approvals awaiting you`}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {pending.length > 0
                  ? 'Review and decide to keep workflows moving'
                  : "You're all caught up — nothing pending"}
              </p>
              {(urgentCount > 0 || warningCount > 0) && (
                <div className="flex items-center gap-2 mt-2">
                  {urgentCount > 0 && (
                    <span className="text-xs font-bold text-red-600 bg-red-100 dark:bg-red-950 dark:text-red-400 border border-red-200 dark:border-red-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertTriangle size={10} /> {urgentCount} overdue
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="text-xs font-bold text-orange-600 bg-orange-100 dark:bg-orange-950 dark:text-orange-400 px-2 py-0.5 rounded-full">
                      {warningCount} aging
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Decision stats + chart */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-400" />
            <CardContent className="p-4">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center mb-3">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-foreground leading-none">{counts.approved ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1.5 font-medium">Approved by me</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-400" />
            <CardContent className="p-4">
              <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950 flex items-center justify-center mb-3">
                <XCircle size={16} className="text-red-500 dark:text-red-400" />
              </div>
              <p className="text-2xl font-bold text-foreground leading-none">{counts.rejected ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1.5 font-medium">Rejected by me</p>
            </CardContent>
          </Card>
        </div>

        {/* Bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">My Decision Summary</CardTitle>
            <CardDescription>Approved vs rejected vs pending</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={decisionData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                  {decisionData.map((entry, i) => (
                    <rect key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pending list */}
      {pending.length > 0 && (
        <Card>
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Needs Your Decision</p>
            <Button size="sm" onClick={() => navigate('/approvals')}>
              Open inbox <ArrowRight size={12} />
            </Button>
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

      {/* Recent approved */}
      {recentApproved.length > 0 && (
        <Card>
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Recently Approved</p>
            <Button variant="ghost" size="sm" onClick={() => navigate('/approvals/history')} className="text-primary text-xs h-7 px-2">
              View all <ArrowRight size={11} />
            </Button>
          </div>
          <div className="divide-y divide-border">
            {recentApproved.slice(0, 5).map(item => (
              <div key={item.approval_instance_id} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{item.form_name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{item.reference_number}</p>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 rounded-full flex-shrink-0 ml-3">
                  <CheckCircle2 size={11} /> Approved
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
