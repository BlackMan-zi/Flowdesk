import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getPendingApprovals, getApprovalHistory } from '../api/approvals'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { SkeletonCard } from '../components/ui/Skeleton'
import { Badge } from '../components/ui/Badge'
import { cn } from '@/lib/utils'
import {
  Clock, CheckCircle2, XCircle, RotateCcw, Search, X,
  ChevronRight, AlertTriangle, Filter, Eye, History, InboxIcon,
} from 'lucide-react'

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—'

function UrgencyBadge({ days }) {
  if (days == null) return null
  if (days >= 5) return (
    <Badge className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 gap-1">
      <AlertTriangle size={10} /> {days}d overdue
    </Badge>
  )
  if (days >= 3) return (
    <Badge className="bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 gap-1">
      <Clock size={10} /> {days}d waiting
    </Badge>
  )
  return <span className="text-xs text-muted-foreground">{days === 0 ? 'Today' : `${days}d ago`}</span>
}

function ActionBadge({ action }) {
  const map = {
    approved:  { label: 'Approved',  className: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800', icon: CheckCircle2 },
    rejected:  { label: 'Rejected',  className: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800', icon: XCircle },
    sent_back: { label: 'Sent Back', className: 'bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800', icon: RotateCcw },
  }
  const cfg = map[action] || { label: action, className: 'bg-muted text-muted-foreground border border-border', icon: Clock }
  const Icon = cfg.icon
  return (
    <Badge className={cn('gap-1 whitespace-nowrap', cfg.className)}>
      <Icon size={10} /> {cfg.label}
    </Badge>
  )
}

function QueueCard({ item, onClick }) {
  const isUrgent  = item.days_waiting >= 5
  const isWarning = item.days_waiting >= 3 && item.days_waiting < 5

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-card rounded-xl border p-5 cursor-pointer hover:shadow-md transition-all group',
        isUrgent  ? 'border-red-300 dark:border-red-800 ring-1 ring-red-200 dark:ring-red-900' :
        isWarning ? 'border-orange-200 dark:border-orange-800' :
                    'border-border hover:border-primary/40'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-foreground">{item.form_name}</p>
            {item.current_version > 1 && (
              <Badge className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px]">
                v{item.current_version} revised
              </Badge>
            )}
            {isUrgent && (
              <Badge className="bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 gap-1 text-[10px]">
                <AlertTriangle size={9} /> Overdue
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-mono text-foreground/70">{item.reference_number}</span>
            {' · '}From <span className="font-semibold text-foreground">{item.initiator}</span>
          </p>

          {/* Step progress */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex gap-0.5">
              {Array.from({ length: item.total_steps || 1 }).map((_, i) => (
                <div key={i} className={cn(
                  'h-1.5 w-5 rounded-full',
                  i < (item.step_order - 1) ? 'bg-emerald-500' :
                  i === (item.step_order - 1) ? 'bg-amber-400' :
                  'bg-muted'
                )} />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              Step {item.step_order}/{item.total_steps}
              {item.step_label && (
                <span className="ml-1 font-semibold text-foreground">· {item.step_label}</span>
              )}
            </span>
          </div>

          {item.delegated_from && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-1.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              Delegated from {item.delegated_from}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-3 flex-shrink-0">
          <UrgencyBadge days={item.days_waiting} />
          <Button size="sm" onClick={e => { e.stopPropagation(); onClick() }}>
            Review <ChevronRight size={12} />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ApprovalsInbox({ initialTab = 'pending' }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState(initialTab)
  const [qSearch, setQSearch] = useState('')
  const [hSearch, setHSearch] = useState('')
  const [hAction, setHAction] = useState('')
  const [hDateFrom, setHDateFrom] = useState('')
  const [hDateTo, setHDateTo] = useState('')

  const { data: pending = [], isLoading: pLoading } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => getPendingApprovals().then(r => r.data),
    refetchInterval: 30_000,
  })

  const historyParams = useMemo(() => {
    const p = {}
    if (hAction)   p.action    = hAction
    if (hDateFrom) p.date_from = hDateFrom
    if (hDateTo)   p.date_to   = hDateTo
    return p
  }, [hAction, hDateFrom, hDateTo])

  const { data: history = [], isLoading: hLoading } = useQuery({
    queryKey: ['approvals', 'history', historyParams],
    queryFn: () => getApprovalHistory(historyParams).then(r => r.data),
    enabled: tab === 'history',
  })

  const filteredPending = useMemo(() => {
    if (!qSearch.trim()) return pending
    const tokens = qSearch.toLowerCase().split(/\s+/).filter(Boolean)
    return pending.filter(item => {
      const hay = [item.form_name, item.reference_number, item.initiator, item.step_label]
        .filter(Boolean).join(' ').toLowerCase()
      return tokens.every(t => hay.includes(t))
    })
  }, [pending, qSearch])

  const filteredHistory = useMemo(() => {
    if (!hSearch.trim()) return history
    const tokens = hSearch.toLowerCase().split(/\s+/).filter(Boolean)
    return history.filter(item => {
      const hay = [item.form_name, item.reference_number, item.initiator, item.step_label, item.notes]
        .filter(Boolean).join(' ').toLowerCase()
      return tokens.every(t => hay.includes(t))
    })
  }, [history, hSearch])

  const hasHistoryFilters = hAction || hDateFrom || hDateTo
  const clearHistoryFilters = () => { setHAction(''); setHDateFrom(''); setHDateTo('') }

  return (
    <div className="max-w-3xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Approvals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Review and act on requests assigned to you</p>
        </div>
        {pending.length > 0 && tab !== 'pending' && (
          <Button variant="outline" size="sm" onClick={() => setTab('pending')} className="gap-1.5">
            <Clock size={13} className="text-amber-500" />
            {pending.length} pending
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <InboxIcon size={14} /> Queue
            {pending.length > 0 && (
              <Badge className="bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-0 text-[10px] px-1.5 py-0.5 ml-0.5">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History size={14} /> History
          </TabsTrigger>
        </TabsList>

        {/* Queue tab */}
        <TabsContent value="pending" className="mt-5 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={qSearch}
              onChange={e => setQSearch(e.target.value)}
              placeholder="Search by form, reference, person…"
              className="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {qSearch && (
              <button onClick={() => setQSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded">
                <X size={13} />
              </button>
            )}
          </div>

          {pLoading ? (
            <SkeletonCard rows={4} title={false} />
          ) : filteredPending.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="w-14 h-14 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={24} className="text-emerald-500 dark:text-emerald-400" />
                </div>
                <p className="text-base font-bold text-foreground">
                  {qSearch ? 'No matches found' : 'Queue is clear'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {qSearch ? 'Try a different search term.' : "No pending approvals right now — you're all caught up."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredPending.map(item => (
                <QueueCard
                  key={item.approval_instance_id}
                  item={item}
                  onClick={() => navigate(`/approvals/${item.form_instance_id}`)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="mt-5 space-y-4">
          {/* Filter panel */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Filter size={14} className="text-muted-foreground" />
                  Filters
                  {hasHistoryFilters && (
                    <Badge className="bg-primary/10 text-primary border-0 text-[10px] ml-1">Active</Badge>
                  )}
                </div>
                {hasHistoryFilters && (
                  <Button variant="ghost" size="xs" onClick={clearHistoryFilters} className="text-destructive hover:text-destructive gap-1">
                    <X size={11} /> Clear
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Outcome</label>
                  <select
                    value={hAction}
                    onChange={e => setHAction(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">All outcomes</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="sent_back">Sent Back</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">From date</label>
                  <input type="date" value={hDateFrom} onChange={e => setHDateFrom(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">To date</label>
                  <input type="date" value={hDateTo} onChange={e => setHDateTo(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                </div>
              </div>
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={hSearch}
                  onChange={e => setHSearch(e.target.value)}
                  placeholder="Search by form, reference, person, notes…"
                  className="flex h-8 w-full rounded-md border border-input bg-background pl-9 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {hSearch && (
                  <button onClick={() => setHSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded">
                    <X size={12} />
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          {hLoading ? (
            <SkeletonCard rows={5} title={false} />
          ) : filteredHistory.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center">
                <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <History size={22} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-bold text-foreground">No history records found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {hasHistoryFilters || hSearch ? 'Try adjusting your filters.' : 'Your approval history will appear here.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {filteredHistory.map(item => (
                  <div key={item.approval_instance_id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <p className="text-sm font-bold text-foreground">{item.form_name}</p>
                        <ActionBadge action={item.action} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-mono text-foreground/70">{item.reference_number}</span>
                        {item.initiator && <span> · {item.initiator}</span>}
                        {item.step_label && <span className="text-muted-foreground/60"> · {item.step_label}</span>}
                      </p>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-1.5 italic truncate max-w-md bg-muted/50 px-2 py-1 rounded-md">
                          "{item.notes}"
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(item.signed_at)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => navigate(`/approvals/${item.form_instance_id}`)}
                        title="View form"
                      >
                        <Eye size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-border bg-muted/30 rounded-b-xl">
                <p className="text-xs text-muted-foreground">
                  {filteredHistory.length} record{filteredHistory.length !== 1 ? 's' : ''}
                  {(hasHistoryFilters || hSearch) && <span className="text-primary"> · filtered</span>}
                </p>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
