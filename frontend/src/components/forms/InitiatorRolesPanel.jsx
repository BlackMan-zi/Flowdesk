import React, { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'
import { ShieldCheck, Search, Check, Users, Briefcase, User as UserIcon, X } from 'lucide-react'

/**
 * Picker for who is allowed to initiate this form.
 *
 * The allowed set is the UNION of:
 *   - users holding any role in `selectedRoleIds`
 *   - users explicitly listed in `selectedUserIds`
 *
 * Empty selection in both lists = open to every user in the org (default).
 *
 * Layout: a toggle switches the picker between "By Role" and "By User".
 * The summary chip + the badge list at the top always show the combined
 * state so the admin can see at a glance who's allowed.
 */
export default function InitiatorRolesPanel({
  roles, users,
  selectedRoleIds = [], selectedUserIds = [],
  onChangeRoles, onChangeUsers,
}) {
  const [mode, setMode] = useState('role') // 'role' | 'user'
  const [query, setQuery] = useState('')

  const roleMap = useMemo(() => Object.fromEntries(roles.map(r => [r.id, r])), [roles])
  const userMap = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users])

  // ── Role list, grouped by category ──────────────────────────────────────────
  const groupedRoles = useMemo(() => {
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

  // ── User list, filtered ─────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const list = users.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (!tokens.length) return list
    return list.filter(u =>
      tokens.every(t =>
        (u.name || '').toLowerCase().includes(t) ||
        (u.email || '').toLowerCase().includes(t)
      )
    )
  }, [users, query])

  const toggleRole = (id) => {
    onChangeRoles(selectedRoleIds.includes(id)
      ? selectedRoleIds.filter(x => x !== id)
      : [...selectedRoleIds, id])
  }
  const toggleUser = (id) => {
    onChangeUsers(selectedUserIds.includes(id)
      ? selectedUserIds.filter(x => x !== id)
      : [...selectedUserIds, id])
  }
  const clearAll = () => { onChangeRoles([]); onChangeUsers([]) }

  const totalSelected = selectedRoleIds.length + selectedUserIds.length

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <ShieldCheck size={14} className="text-muted-foreground" />
            Who can start this form?
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pick roles, specific users, or both. <strong>Leave empty</strong> to allow any user.
          </p>
        </div>
        {totalSelected > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Combined summary */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-md border text-xs',
          totalSelected === 0
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
            : 'border-primary/30 bg-primary/5 text-foreground'
        )}
      >
        <Users size={13} />
        {totalSelected === 0
          ? 'Open to every user in the organisation.'
          : `Restricted to ${selectedRoleIds.length} role${selectedRoleIds.length === 1 ? '' : 's'} + ${selectedUserIds.length} specific user${selectedUserIds.length === 1 ? '' : 's'}.`}
      </div>

      {/* Selected badges across roles and users */}
      {totalSelected > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedRoleIds.map(id => {
            const r = roleMap[id]
            return (
              <span key={`r-${id}`} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[11px] px-2 py-1 rounded-full border border-primary/20">
                <Briefcase size={10} /> {r?.name || id}
                <button onClick={() => toggleRole(id)} className="hover:text-destructive ml-0.5"><X size={10} /></button>
              </span>
            )
          })}
          {selectedUserIds.map(id => {
            const u = userMap[id]
            return (
              <span key={`u-${id}`} className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] px-2 py-1 rounded-full border border-amber-500/20">
                <UserIcon size={10} /> {u?.name || id}
                <button onClick={() => toggleUser(id)} className="hover:text-destructive ml-0.5"><X size={10} /></button>
              </span>
            )
          })}
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-md border border-border w-fit">
        <button
          type="button"
          onClick={() => { setMode('role'); setQuery('') }}
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded',
            mode === 'role' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Briefcase size={11} /> By Role
          {selectedRoleIds.length > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
              {selectedRoleIds.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setMode('user'); setQuery('') }}
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded',
            mode === 'user' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <UserIcon size={11} /> By User
          {selectedUserIds.length > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold">
              {selectedUserIds.length}
            </span>
          )}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={mode === 'role' ? 'Search roles…' : 'Search users by name or email…'}
          className="w-full border border-border bg-background text-foreground rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Role list (grouped) */}
      {mode === 'role' && (
        <div className="space-y-3">
          {Object.keys(groupedRoles).sort().map(cat => (
            <div key={cat}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{cat}</p>
              <div className="space-y-1">
                {groupedRoles[cat].map(r => {
                  const isSelected = selectedRoleIds.includes(r.id)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRole(r.id)}
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
          {Object.keys(groupedRoles).length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground border-2 border-dashed border-border rounded-md">
              No roles match your search.
            </div>
          )}
        </div>
      )}

      {/* User list */}
      {mode === 'user' && (
        <div className="space-y-1">
          {filteredUsers.map(u => {
            const isSelected = selectedUserIds.includes(u.id)
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleUser(u.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-md border text-left transition-all',
                  isSelected
                    ? 'border-amber-500 bg-amber-500/5 text-foreground'
                    : 'border-border bg-card hover:border-foreground/30 text-foreground'
                )}
              >
                <span
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                    isSelected
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-background border-border'
                  )}
                >
                  {isSelected && <Check size={11} />}
                </span>
                <span className="text-sm font-medium">{u.name}</span>
                {u.email && <span className="text-[10px] text-muted-foreground truncate ml-auto">{u.email}</span>}
              </button>
            )
          })}
          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground border-2 border-dashed border-border rounded-md">
              No users match your search.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
