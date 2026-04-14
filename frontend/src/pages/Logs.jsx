import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAuditLogs } from '../api/dashboard'
import Card, { CardHeader } from '../components/ui/Card'
import Spinner from '../components/ui/Spinner'
import { Activity, ChevronLeft, ChevronRight, Search } from 'lucide-react'

const ACTION_COLORS = {
  FORM_SUBMITTED:   'bg-blue-100 text-blue-700',
  STEP_APPROVED:    'bg-emerald-100 text-emerald-700',
  FORM_REJECTED:    'bg-red-100 text-red-700',
  FORM_SENT_BACK:   'bg-orange-100 text-orange-700',
  USER_LOGIN:       'bg-slate-100 text-slate-600',
  PASSWORD_RESET:   'bg-yellow-100 text-yellow-700',
  FORM_COMPLETED:   'bg-green-100 text-green-700',
}

function ActionBadge({ action }) {
  const cls = ACTION_COLORS[action] || 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {action.replace(/_/g, ' ')}
    </span>
  )
}

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function Logs() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const perPage = 50

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () => getAuditLogs({ page, per_page: perPage }).then(r => r.data),
    keepPreviousData: true,
  })

  const logs = data?.logs || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / perPage) || 1

  const filtered = search
    ? logs.filter(l =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        (l.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.entity_type || '').toLowerCase().includes(search.toLowerCase())
      )
    : logs

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Activity size={20} className="text-slate-400" /> Activity Logs
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Full audit trail of all system events.</p>
        </div>
        <span className="text-sm text-slate-400">{total.toLocaleString()} total events</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Filter by action, user, or entity…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Timestamp</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Entity</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-400 text-sm">
                        No log entries found.
                      </td>
                    </tr>
                  ) : filtered.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap font-mono">
                        {fmt(log.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <ActionBadge action={log.action} />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <p className="font-medium">{log.user_name || 'System'}</p>
                        {log.user_email && <p className="text-xs text-slate-400">{log.user_email}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {log.entity_type && (
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                            {log.entity_type}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate">
                        {log.details ? JSON.stringify(log.details) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <span className="text-xs text-slate-500">
                  Page {page} of {totalPages} · {total} total
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
