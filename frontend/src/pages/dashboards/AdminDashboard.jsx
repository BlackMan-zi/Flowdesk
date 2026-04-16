import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getAdminDashboard } from '../../api/dashboard'
import { getPendingApprovals } from '../../api/approvals'
import { useAuth } from '../../context/AuthContext'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import { SkeletonDashboard } from '../../components/ui/Skeleton'
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert'
import { Progress } from '../../components/ui/progress'
import { Separator } from '../../components/ui/separator'
import {
  Activity, Clock, CheckCircle2, XCircle, AlertTriangle,
  Users, FormInput, GitBranch, RotateCcw, ChevronRight,
  TrendingUp, ArrowRight, Zap, FileText,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area,
} from 'recharts'

// ── Colour palette ────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  Pending:                   '#f59e0b',
  Completed:                 '#10b981',
  Approved:                  '#10b981',
  Rejected:                  '#ef4444',
  Draft:                     '#94a3b8',
  'Returned for Correction': '#f97316',
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill || p.color || p.stroke }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, icon: Icon, colorClass, accentClass, alert, onClick, delta }) {
  return (
    <Card
      className={`relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${alert ? 'ring-1 ring-orange-300' : ''}`}
      onClick={onClick}
    >
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${accentClass}`} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass}`}>
            <Icon size={18} />
          </div>
          {alert && (
            <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-300 border border-orange-200 dark:border-orange-800 px-1.5 py-0.5 rounded-full">
              Alert
            </span>
          )}
        </div>
        <p className="text-2xl font-bold text-foreground leading-none">{value ?? 0}</p>
        <p className="text-xs text-muted-foreground mt-1.5 font-medium">{label}</p>
        {delta != null && (
          <p className={`text-xs mt-1.5 font-medium ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)} this week
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Quick action ──────────────────────────────────────────────────────────────

function QuickAction({ label, icon: Icon, to, navigate, description }) {
  return (
    <button
      onClick={() => navigate(to)}
      className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/50 text-left transition-colors group"
    >
      <div className="w-9 h-9 rounded-xl bg-muted group-hover:bg-primary/10 flex items-center justify-center flex-shrink-0 transition-colors">
        <Icon size={15} className="text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>}
      </div>
      <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-primary transition-colors" />
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: adminData, isLoading } = useQuery({
    queryKey: ['dashboard', 'admin'],
    queryFn: () => getAdminDashboard().then(r => r.data),
    refetchInterval: 60_000,
  })

  const { data: myPending = [] } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => getPendingApprovals().then(r => r.data),
    refetchInterval: 30_000,
  })

  if (isLoading) return <SkeletonDashboard />

  const s         = adminData?.by_status || {}
  const forms     = adminData?.forms || []
  const pending   = s['Pending']   || 0
  const completed = (s['Completed'] || 0) + (s['Approved'] || 0)
  const rejected  = s['Rejected']  || 0
  const draft     = s['Draft']     || 0
  const returned  = s['Returned for Correction'] || 0
  const total     = adminData?.total_forms || 0
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

  const stuckForms = forms.filter(f =>
    f.status === 'Pending' && f.submitted_at &&
    (Date.now() - new Date(f.submitted_at)) > 3 * 24 * 60 * 60 * 1000
  )

  // Chart data
  const pieData = [
    { name: 'Pending',   value: pending,   color: STATUS_COLORS.Pending },
    { name: 'Completed', value: completed, color: STATUS_COLORS.Completed },
    { name: 'Rejected',  value: rejected,  color: STATUS_COLORS.Rejected },
    { name: 'Draft',     value: draft,     color: STATUS_COLORS.Draft },
    { name: 'Returned',  value: returned,  color: STATUS_COLORS['Returned for Correction'] },
  ].filter(d => d.value > 0)

  const barData = [
    { name: 'Completed',  value: completed, fill: STATUS_COLORS.Completed },
    { name: 'Pending',    value: pending,   fill: STATUS_COLORS.Pending },
    { name: 'Draft',      value: draft,     fill: STATUS_COLORS.Draft },
    { name: 'Returned',   value: returned,  fill: STATUS_COLORS['Returned for Correction'] },
    { name: 'Rejected',   value: rejected,  fill: STATUS_COLORS.Rejected },
  ]

  // Simulate submission trend (last 7 days from forms data)
  const trendData = (() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const label = d.toLocaleDateString('en-GB', { weekday: 'short' })
      const count = forms.filter(f => {
        if (!f.submitted_at) return false
        const fd = new Date(f.submitted_at)
        return fd.toDateString() === d.toDateString()
      }).length
      days.push({ name: label, submissions: count })
    }
    return days
  })()

  return (
    <div className="max-w-7xl space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">System Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Organisation-wide workflow health ·{' '}
            <span className="font-semibold text-foreground">{total} total forms</span>
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate('/logs')}>
          <Activity size={13} />
          View Logs
        </Button>
      </div>

      {/* Alerts */}
      {myPending.length > 0 && (
        <Alert variant="warning">
          <Clock className="h-4 w-4" />
          <AlertTitle>{myPending.length} approval{myPending.length > 1 ? 's' : ''} awaiting your decision</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Review them to keep workflows moving.</span>
            <Button size="sm" className="mt-1" onClick={() => navigate('/approvals')}>
              Review now <ArrowRight size={13} />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {stuckForms.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{stuckForms.length} form{stuckForms.length > 1 ? 's' : ''} pending for more than 3 days</AlertTitle>
          <AlertDescription>These may need manual intervention.</AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Forms"        value={total}     icon={FileText}
          colorClass="bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
          accentClass="bg-gradient-to-r from-blue-500 to-primary"
          onClick={() => navigate('/my-forms')}
        />
        <KPICard
          label="Pending Approval"   value={pending}   icon={Clock}
          colorClass="bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400"
          accentClass="bg-gradient-to-r from-amber-500 to-orange-400"
          alert={stuckForms.length > 0}
          onClick={() => navigate('/approvals')}
        />
        <KPICard
          label="Completed"          value={completed} icon={CheckCircle2}
          colorClass="bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
          accentClass="bg-gradient-to-r from-emerald-500 to-teal-400"
        />
        <KPICard
          label="Rejected"           value={rejected}  icon={XCircle}
          colorClass="bg-red-50 dark:bg-red-950 text-red-500 dark:text-red-400"
          accentClass="bg-gradient-to-r from-red-500 to-rose-400"
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Completion rate */}
        <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="opacity-70" />
              <span className="text-xs font-semibold opacity-70 uppercase tracking-wide">Completion Rate</span>
            </div>
            <p className="text-4xl font-bold">{completionRate}%</p>
            <p className="text-sm opacity-70 mt-1">{completed} of {total} forms completed</p>
            <Progress value={completionRate} className="mt-3 bg-white/20 [&>div]:bg-white" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950 flex items-center justify-center flex-shrink-0">
              <RotateCcw size={20} className="text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{returned}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Returned for correction</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
              <Zap size={20} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{adminData?.correction_cycles || 0}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Correction cycles</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Forms by Status</CardTitle>
            <CardDescription>Volume breakdown across all statuses</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Donut chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Workflow Distribution</CardTitle>
            <CardDescription>Proportional split by status</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  formatter={(v) => <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Submission trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Submission Trends</CardTitle>
            <CardDescription>Daily submissions over the last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="submGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="submissions"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#submGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent submissions + quick actions */}
        <Card>
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <p className="text-sm font-semibold text-foreground">Recent Submissions</p>
              <p className="text-xs text-muted-foreground mt-0.5">{forms.length} total</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/my-forms')}
              className="text-primary h-7 px-2 text-xs"
            >
              View all <ChevronRight size={12} />
            </Button>
          </div>
          <div className="divide-y divide-border">
            {forms.slice(0, 6).map(f => (
              <div key={f.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{f.form_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">{f.reference_number}</p>
                </div>
                <Badge label={f.status} />
              </div>
            ))}
            {forms.length === 0 && (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-muted-foreground">No submissions yet.</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <div className="px-6 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Quick Actions</p>
          <p className="text-xs text-muted-foreground mt-0.5">System configuration shortcuts</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <div className="divide-y divide-border">
            <QuickAction label="Manage Users"        icon={Users}     to="/admin/users"              navigate={navigate} description="Add, edit, and assign roles" />
            <QuickAction label="Form Definitions"    icon={FormInput} to="/admin/form-definitions"   navigate={navigate} description="Design and manage form types" />
          </div>
          <div className="divide-y divide-border">
            <QuickAction label="Approval Templates"  icon={GitBranch} to="/admin/approval-templates" navigate={navigate} description="Configure multi-step workflows" />
            <QuickAction label="Activity Logs"       icon={Activity}  to="/logs"                     navigate={navigate} description="Track system-wide events" />
          </div>
        </div>
      </Card>

    </div>
  )
}
