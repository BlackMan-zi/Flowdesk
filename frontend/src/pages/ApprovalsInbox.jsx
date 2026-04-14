import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getPendingApprovals, getApprovalHistory } from '../api/approvals'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import {
  Clock, CheckCircle2, XCircle, RotateCcw, Search, X,
  ChevronRight, AlertTriangle, Filter, Eye
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function UrgencyBadge({ days }) {
  if (days == null) return null
  if (days >= 5) return (
    <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <AlertTriangle size={11} /> {days}d — overdue
    </span>
  )
  if (days >= 3) return (
    <span className="flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
      <Clock size={11} /> {days}d waiting
    </span>
  )
  return (
    <span className="text-xs text-slate-400">{days === 0 ? 'Today' : `${days}d ago`}</span>
  )
}

function ActionBadge({ action }) {
  const map = {
    approved:  { label: 'Approved',  cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    rejected:  { label: 'Rejected',  cls: 'bg-red-100 text-red-700',         icon: XCircle      },
    sent_back: { label: 'Sent Back', cls: 'bg-orange-100 text-orange-700',   icon: RotateCcw    },
  }
  const cfg = map[action] || { label: action, cls: 'bg-slate-100 text-slate-600', icon: Clock }
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  )
}

// ── Queue card ────────────────────────────────────────────────────────────────

function QueueCard({ item, onClick }) {
  const isUrgent = item.days_waiting >= 5
  const isWarning = item.days_waiting >= 3 && item.days_waiting < 5

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all group ${
        isUrgent  ? 'border-red-300 ring-1 ring-red-200'    :
        isWarning ? 'border-orange-300 ring-1 ring-orange-200' :
                    'border-slate-200 hover:border-brand-300'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">

          {/* Form name + version badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900">{item.form_name}</p>
            {item.current_version > 1 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                v{item.current_version} — revised
              </span>
            )}
          </div>

          {/* Reference + initiator */}
          <p className="text-xs text-slate-500 mt-0.5">
            <span className="font-mono">{item.reference_number}</span>
            {' · '}From <span className="font-medium text-slate-700">{item.initiator}</span>
          </p>

          {/* Step progress */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex gap-0.5">
              {Array.from({ length: item.total_steps || 1 }).map((_, i) => (
                <div key={i} className={`h-1.5 w-6 rounded-full ${
                  i < (item.step_order - 1) ? 'bg-emerald-500' :
                  i === (item.step_order - 1) ? 'bg-amber-400' :
                  'bg-slate-200'
                }`} />
              ))}
            </div>
            <span className="text-xs text-slate-500">
              Step {item.step_order} of {item.total_steps}
              {item.step_label && <span className="ml-1 font-medium text-slate-700">· {item.step_label}</span>}
            </span>
          </div>

          {item.delegated_from && (
            <p className="text-xs text-amber-600 mt-1">Delegated from {item.delegated_from}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <UrgencyBadge days={item.days_waiting} />
          <Button size="sm" onClick={e => { e.stopPropagation(); onClick() }}>
            Review
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ApprovalsInbox({ initialTab = 'pending' }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState(initialTab)

  // Queue state
  const [qSearch, setQSearch] = useState('')

  // History filter state
  const [hSearch, setHSearch]     = useState('')
  const [hAction, setHAction]     = useState('')
  const [hDateFrom, setHDateFrom] = useState('')
  const [hDateTo, setHDateTo]     = useState('')

  const { data: pending = [], isLoading: pLoading } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => getPendingApprovals().then(r => r.data),
    refetchInterval: 30_000
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
    enabled: tab === 'history'
  })

  // Token-based search on queue
  const filteredPending = useMemo(() => {
    if (!qSearch.trim()) return pending
    const tokens = qSearch.toLowerCase().split(/\s+/).filter(Boolean)
    return pending.filter(item => {
      const hay = [item.form_name, item.reference_number, item.initiator, item.step_label]
        .filter(Boolean).join(' ').toLowerCase()
      return tokens.every(t => hay.includes(t))
    })
  }, [pending, qSearch])

  // Token-based search on history
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
    <div className="max-w-3xl space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Approvals</h1>
          <p className="text-sm text-slate-500 mt-0.5">Review and act on requests assigned to you</p>
        </div>
        {pending.length > 0 && tab !== 'pending' && (
          <span className="bg-amber-100 text-amber-700 text-sm font-semibold px-3 py-1 rounded-full">
            {pending.length} pending
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'pending', label: 'Queue', count: pending.length },
          { key: 'history', label: 'History' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── QUEUE TAB ── */}
      {tab === 'pending' && (
        pLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <>
            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={qSearch}
                onChange={e => setQSearch(e.target.value)}
                placeholder="Search by form, reference, person…"
                className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              />
              {qSearch && (
                <button onClick={() => setQSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {filteredPending.length === 0 ? (
              <Card className="py-14 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={20} className="text-emerald-600" />
                </div>
                <p className="text-slate-700 font-semibold">
                  {qSearch ? 'No matches' : 'Queue is clear'}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  {qSearch ? 'Try a different search term.' : 'No pending approvals right now.'}
                </p>
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
          </>
        )
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <>
          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <Filter size={14} /> Filters
              </div>
              {hasHistoryFilters && (
                <button onClick={clearHistoryFilters} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
                  <X size={11} /> Clear filters
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Outcome</label>
                <select
                  value={hAction}
                  onChange={e => setHAction(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">All outcomes</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="sent_back">Sent Back</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">From date</label>
                <input type="date" value={hDateFrom} onChange={e => setHDateFrom(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">To date</label>
                <input type="date" value={hDateTo} onChange={e => setHDateTo(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={hSearch}
                onChange={e => setHSearch(e.target.value)}
                placeholder="Search by form, reference, person, notes…"
                className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
              />
              {hSearch && (
                <button onClick={() => setHSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {hLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : filteredHistory.length === 0 ? (
            <Card className="py-12 text-center">
              <p className="text-slate-500 text-sm">No history records found.</p>
            </Card>
          ) : (
            <Card>
              <div className="divide-y divide-slate-100">
                {filteredHistory.map(item => (
                  <div key={item.approval_instance_id}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-800">{item.form_name}</p>
                        <ActionBadge action={item.action} />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="font-mono">{item.reference_number}</span>
                        {item.initiator && <span> · {item.initiator}</span>}
                        {item.step_label && <span className="text-slate-400"> · {item.step_label}</span>}
                      </p>
                      {item.notes && (
                        <p className="text-xs text-slate-400 mt-1 italic truncate max-w-md">"{item.notes}"</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-slate-400">{fmtDate(item.signed_at)}</span>
                      <button
                        onClick={() => navigate(`/approvals/${item.form_instance_id}`)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-brand-600 transition-colors"
                        title="View form"
                      >
                        <Eye size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50 rounded-b-xl">
                <p className="text-xs text-slate-400">
                  {filteredHistory.length} record{filteredHistory.length !== 1 ? 's' : ''}
                  {(hasHistoryFilters || hSearch) && ` (filtered)`}
                </p>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
