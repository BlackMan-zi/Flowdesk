import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listFormInstances } from '../api/forms'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import {
  Plus, Search, X, Clock, CheckCircle2, XCircle,
  RotateCcw, FileEdit, ChevronRight, Users
} from 'lucide-react'

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: '',                      label: 'All' },
  { key: 'Draft',                 label: 'Draft' },
  { key: 'Pending',               label: 'In Progress' },
  { key: 'Returned for Correction', label: 'Returned' },
  { key: 'Rejected',              label: 'Rejected' },
  { key: 'Completed',             label: 'Completed' },
  { key: 'Approved',              label: 'Approved' },
]

const STATUS_STYLE = {
  Draft:                    { bg: 'bg-slate-100',   text: 'text-slate-600',  icon: FileEdit,     ring: 'ring-slate-300' },
  Pending:                  { bg: 'bg-amber-50',    text: 'text-amber-700',  icon: Clock,        ring: 'ring-amber-300' },
  'Returned for Correction':{ bg: 'bg-orange-50',   text: 'text-orange-700', icon: RotateCcw,    ring: 'ring-orange-300' },
  Rejected:                 { bg: 'bg-red-50',      text: 'text-red-700',    icon: XCircle,      ring: 'ring-red-300' },
  Completed:                { bg: 'bg-emerald-50',  text: 'text-emerald-700',icon: CheckCircle2, ring: 'ring-emerald-300' },
  Approved:                 { bg: 'bg-emerald-50',  text: 'text-emerald-700',icon: CheckCircle2, ring: 'ring-emerald-300' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_STYLE[status] || STATUS_STYLE['Pending']
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <Icon size={11} />
      {status === 'Pending' ? 'In Progress' : status}
    </span>
  )
}

// ── Approval progress pipeline ────────────────────────────────────────────────

function ApprovalPipeline({ progress }) {
  if (!progress) return null
  const { total_steps, completed_steps, active_step_order, active_step_label, active_approver } = progress

  return (
    <div className="mt-2">
      {/* Step bar */}
      <div className="flex items-center gap-0.5 mb-1">
        {Array.from({ length: total_steps }).map((_, i) => {
          const stepNum = i + 1
          const isDone   = stepNum <= completed_steps
          const isActive = stepNum === active_step_order
          return (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                isDone   ? 'bg-emerald-500' :
                isActive ? 'bg-amber-400 animate-pulse' :
                           'bg-slate-200'
              }`}
            />
          )
        })}
      </div>
      {/* Label */}
      <p className="text-xs text-slate-500">
        <span className="font-medium text-slate-700">Step {active_step_order} of {total_steps}</span>
        {active_step_label && <span> · {active_step_label}</span>}
        {active_approver && (
          <span className="ml-1 text-amber-600 font-medium">· {active_approver}</span>
        )}
      </p>
    </div>
  )
}

// ── Request card ──────────────────────────────────────────────────────────────

function RequestCard({ item, onClick }) {
  const cfg = STATUS_STYLE[item.current_status] || STATUS_STYLE['Pending']
  const isPending   = item.current_status === 'Pending'
  const isDraft     = item.current_status === 'Draft'
  const isReturned  = item.current_status === 'Returned for Correction'

  return (
    <div
      onClick={onClick}
      className={`bg-white border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all group ring-1 ${cfg.ring} hover:ring-2`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900 truncate">{item.form_name || 'Form'}</p>
            <StatusBadge status={item.current_status} />
          </div>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">{item.reference_number}</p>

          {/* Progress pipeline for in-progress forms */}
          {isPending && item.approval_progress && (
            <ApprovalPipeline progress={item.approval_progress} />
          )}

          {/* Returned note */}
          {isReturned && (
            <p className="mt-1.5 text-xs text-orange-600 flex items-center gap-1">
              <RotateCcw size={11} /> Returned for your correction — action needed
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <p className="text-xs text-slate-400">
            {item.submitted_at
              ? fmt(item.submitted_at)
              : <span className="text-slate-300 italic">Not submitted</span>}
          </p>
          <ChevronRight size={15} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
        </div>
      </div>
    </div>
  )
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({ items }) {
  const counts = items.reduce((acc, i) => {
    acc[i.current_status] = (acc[i.current_status] || 0) + 1
    return acc
  }, {})

  const tiles = [
    { label: 'Total',      value: items.length,                     color: 'text-slate-700' },
    { label: 'In Progress',value: counts['Pending'] || 0,           color: 'text-amber-600' },
    { label: 'Returned',   value: counts['Returned for Correction'] || 0, color: 'text-orange-600' },
    { label: 'Completed',  value: (counts['Completed'] || 0) + (counts['Approved'] || 0), color: 'text-emerald-600' },
    { label: 'Rejected',   value: counts['Rejected'] || 0,          color: 'text-red-600' },
    { label: 'Draft',      value: counts['Draft'] || 0,             color: 'text-slate-500' },
  ]

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      {tiles.map(t => (
        <div key={t.label} className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 text-center">
          <p className={`text-xl font-bold ${t.color}`}>{t.value}</p>
          <p className="text-xs text-slate-400 mt-0.5">{t.label}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MyForms() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('')
  const [search, setSearch] = useState('')

  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ['form-instances'],
    queryFn: () => listFormInstances().then(r => r.data),
    refetchInterval: 30_000,
  })

  const tabFiltered = useMemo(() => {
    if (!activeTab) return allItems
    return allItems.filter(i => i.current_status === activeTab)
  }, [allItems, activeTab])

  const filtered = useMemo(() => {
    if (!search.trim()) return tabFiltered
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean)
    return tabFiltered.filter(item => {
      const haystack = [
        item.form_name,
        item.reference_number,
        item.current_status,
        item.approval_progress?.active_step_label,
        item.approval_progress?.active_approver,
      ].filter(Boolean).join(' ').toLowerCase()
      return tokens.every(t => haystack.includes(t))
    })
  }, [tabFiltered, search])

  // Tab counts
  const tabCount = (key) => {
    if (!key) return allItems.length
    return allItems.filter(i => i.current_status === key).length
  }

  return (
    <div className="max-w-4xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Requests</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track all your requisitions and their approval progress</p>
        </div>
        <Button onClick={() => navigate('/my-forms/new')}>
          <Plus size={15} className="mr-1.5" /> New Request
        </Button>
      </div>

      {/* Summary */}
      {!isLoading && <SummaryStrip items={allItems} />}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {STATUS_TABS.map(tab => {
          const count = tabCount(tab.key)
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                  activeTab === tab.key ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by form name, reference, approver…"
          className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Users size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? 'No requests match your search.' : 'No requests yet.'}</p>
          {!search && !activeTab && (
            <Button className="mt-4" onClick={() => navigate('/my-forms/new')}>
              <Plus size={15} className="mr-1.5" /> Start your first request
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <RequestCard
              key={item.id}
              item={item}
              onClick={() => navigate(`/my-forms/${item.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function fmt(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
