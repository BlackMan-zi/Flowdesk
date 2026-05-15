import React, { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'
import { ShieldCheck, Search, Check, Users } from 'lucide-react'

/**
 * Picker for which approval roles are allowed to initiate this form.
 * Empty selection = open to all users (the default behaviour the backend
 * already implements via `initiator_role_ids`).
 */
export default function InitiatorRolesPanel({ roles, selectedIds, onChange }) {
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const filtered = roles.filter(r =>
      !tokens.length || tokens.every(t => r.name.toLowerCase().includes(t) || (r.category || '').toLowerCase().includes(t))
    )
    const map = {}
    filtered.forEach(r => {
      const cat = r.category || 'Other'
      ;(map[cat] = map[cat] || []).push(r)
    })
    Object.values(map).forEach(list => list.sort((a, b) => a.name.localeCompare(b.name)))
    return map
  }, [roles, query])

  const allCategories = Object.keys(grouped).sort()

  const toggle = (id) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(x => x !== id))
    else onChange([...selectedIds, id])
  }

  const clearAll = () => onChange([])

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <ShieldCheck size={14} className="text-muted-foreground" />
            Who can start this form?
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pick the approval roles allowed to initiate. <strong>Leave empty</strong> to allow any user.
          </p>
        </div>
        {selectedIds.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Selection summary */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-md border text-xs',
          selectedIds.length === 0
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
            : 'border-primary/30 bg-primary/5 text-foreground'
        )}
      >
        <Users size={13} />
        {selectedIds.length === 0
          ? 'Open to every user in the organisation.'
          : `Restricted to ${selectedIds.length} role${selectedIds.length === 1 ? '' : 's'}.`}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search roles…"
          className="w-full border border-border bg-background text-foreground rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Role list grouped by category */}
      <div className="space-y-3">
        {allCategories.map(cat => (
          <div key={cat}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{cat}</p>
            <div className="space-y-1">
              {grouped[cat].map(r => {
                const isSelected = selectedIds.includes(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggle(r.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-md border text-left transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border bg-card hover:border-foreground/30 text-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'bg-background border-border'
                      )}
                    >
                      {isSelected && <Check size={11} />}
                    </span>
                    <span className="text-sm font-medium">{r.name}</span>
                    {r.description && (
                      <span className="text-[10px] text-muted-foreground truncate ml-auto">{r.description}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {allCategories.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground border-2 border-dashed border-border rounded-md">
            No roles match your search.
          </div>
        )}
      </div>
    </div>
  )
}
