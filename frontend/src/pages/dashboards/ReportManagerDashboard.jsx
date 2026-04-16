import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getReportManagerDashboard } from '../../api/dashboard'
import { useAuth } from '../../context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { SkeletonDashboard } from '../../components/ui/Skeleton'
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert'
import { Avatar, AvatarFallback } from '../../components/ui/avatar'
import {
  Clock, CheckCircle2, XCircle, RotateCcw, Users,
  Plus, ChevronRight, ArrowRight, Building2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
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

export default function ReportManagerDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'report-manager'],
    queryFn: () => getReportManagerDashboard().then(r => r.data),
    refetchInterval: 60_000,
  })

  if (isLoading) return <SkeletonDashboard />

  const s           = data?.by_status || {}
  const pending     = s['Pending'] || 0
  const completed   = (s['Completed'] || 0) + (s['Approved'] || 0)
  const rejected    = s['Rejected'] || 0
  const returned    = s['Returned for Correction'] || 0
  const recentForms = data?.recent_forms || []

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const barData = [
    { name: 'Pending',   value: pending,   fill: '#f59e0b' },
    { name: 'Completed', value: completed, fill: '#10b981' },
    { name: 'Rejected',  value: rejected,  fill: '#ef4444' },
    { name: 'Returned',  value: returned,  fill: '#f97316' },
  ]

  return (
    <div className="max-w-4xl space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {greeting()}, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.department_name
              ? <>Department: <span className="font-semibold text-foreground">{data.department_name}</span></>
              : 'Department overview'
            }
          </p>
        </div>
        <Button onClick={() => navigate('/my-forms/new')} className="flex-shrink-0">
          <Plus size={14} /> New Request
        </Button>
      </div>

      {/* Pending approvals alert */}
      {data?.my_pending_count > 0 && (
        <Alert variant="warning">
          <Clock className="h-4 w-4" />
          <AlertTitle>{data.my_pending_count} approval{data.my_pending_count > 1 ? 's' : ''} awaiting your decision</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Review them to keep workflows moving.</span>
            <Button size="sm" className="mt-1" onClick={() => navigate('/approvals')}>
              Review now <ArrowRight size={12} />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Dept info card */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{data?.department_name || 'Your Department'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data?.department_user_count || 0} members · {data?.direct_report_count || 0} direct reports
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stats + chart */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Pending',   value: pending,   icon: Clock,        accent: 'bg-amber-400',   colorClass: 'bg-amber-50 dark:bg-amber-950 text-amber-600' },
            { label: 'Completed', value: completed, icon: CheckCircle2, accent: 'bg-emerald-400', colorClass: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600' },
            { label: 'Rejected',  value: rejected,  icon: XCircle,      accent: 'bg-red-400',     colorClass: 'bg-red-50 dark:bg-red-950 text-red-500' },
            { label: 'Returned',  value: returned,  icon: RotateCcw,    accent: 'bg-orange-400',  colorClass: 'bg-orange-50 dark:bg-orange-950 text-orange-600' },
          ].map(({ label, value, icon: Icon, accent, colorClass }) => (
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

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Department Activity</CardTitle>
            <CardDescription>Request status breakdown</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                  {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent dept forms */}
      <Card>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">Department Requests</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data?.total_dept_forms || 0} total submissions</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/my-forms')} className="text-primary text-xs h-7 px-2">
            My forms <ChevronRight size={12} />
          </Button>
        </div>
        {recentForms.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
              <Users size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No requests yet</p>
            <p className="text-xs text-muted-foreground mt-1">Department submissions will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentForms.map(f => (
              <div key={f.id} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{f.form_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {f.initiator} · <span className="font-mono">{f.reference_number}</span>
                  </p>
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
          <div className="px-6 py-4 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Direct Reports</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data.direct_reports.length} people report to you</p>
          </div>
          <div className="divide-y divide-border">
            {data.direct_reports.map(u => (
              <div key={u.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                    {u.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
