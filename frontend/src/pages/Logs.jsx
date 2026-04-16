import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAuditLogs } from '../api/dashboard'
import { cn } from '@/lib/utils'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react'

const ACTION_COLORS = {
  FORM_SUBMITTED:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  STEP_APPROVED:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  FORM_REJECTED:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  FORM_SENT_BACK:  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  USER_LOGIN:      'bg-muted text-muted-foreground',
  PASSWORD_RESET:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  FORM_COMPLETED:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

function ActionBadge({ action }) {
  const cls = ACTION_COLORS[action] || 'bg-muted text-muted-foreground'
  return (
    <span className={cn('inline-block px-2 py-0.5 rounded text-xs font-medium', cls)}>
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

  const logs        = data?.logs  || []
  const total       = data?.total || 0
  const totalPages  = Math.ceil(total / perPage) || 1

  const filtered = search
    ? logs.filter(l =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        (l.user_name   || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.entity_type || '').toLowerCase().includes(search.toLowerCase())
      )
    : logs

  return (
    <div className="max-w-5xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Activity size={20} className="text-muted-foreground" />
            Activity Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Full audit trail of all system events.</p>
        </div>
        <span className="text-sm text-muted-foreground">{total.toLocaleString()} total events</span>
      </div>

      {/* Search */}
      <Input
        placeholder="Filter by action, user, or entity…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Timestamp</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entity</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                        No log entries found.
                      </td>
                    </tr>
                  ) : filtered.map(log => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
                        {fmt(log.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <ActionBadge action={log.action} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground">{log.user_name || 'System'}</p>
                        {log.user_email && <p className="text-xs text-muted-foreground">{log.user_email}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {log.entity_type && (
                          <span className="bg-muted px-1.5 py-0.5 rounded text-foreground/70">
                            {log.entity_type}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                        {log.details ? JSON.stringify(log.details) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} · {total} total
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-md border border-border hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-md border border-border hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
