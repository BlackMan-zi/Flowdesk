import React, { useState } from 'react'
import { cn } from '../../lib/utils'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { FIELD_TYPE_META, FIELD_TYPES_LIST } from './FormDesignerCanvas'

// Visual order of groups in the toolbox
const TOOLBOX_GROUPS = ['Input', 'Selection', 'Advanced', 'Layout', 'System']

/**
 * Vertical toolbox listing all field types grouped by category.
 * Clicking a type calls `onAdd(type)` — the caller decides which section the
 * new field lands in.
 */
export default function Toolbox({ onAdd, disabled }) {
  const [query, setQuery] = useState('')
  const [openGroups, setOpenGroups] = useState({
    Input: true, Selection: true, Advanced: true, Layout: true, System: true,
  })

  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (type) => {
    if (!tokens.length) return true
    const meta = FIELD_TYPE_META[type]
    const hay = `${meta.label} ${meta.group} ${type}`.toLowerCase()
    return tokens.every(t => hay.includes(t))
  }

  return (
    <aside className="bg-card border-r border-border flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Add a field
        </p>
        <p className="text-[10px] text-muted-foreground/70 leading-snug mt-0.5">
          Click to add to the selected section.
        </p>
      </div>

      <div className="px-3 pt-2">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search field types…"
            className="w-full border border-border bg-background text-foreground rounded-md pl-7 pr-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {TOOLBOX_GROUPS.map(group => {
          const types = FIELD_TYPES_LIST.filter(t => FIELD_TYPE_META[t].group === group && matches(t))
          if (types.length === 0) return null
          const open = openGroups[group]
          return (
            <div key={group}>
              <button
                type="button"
                onClick={() => setOpenGroups(p => ({ ...p, [group]: !p[group] }))}
                className="w-full flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground py-1 px-1"
              >
                {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                {group}
                <span className="ml-auto text-[9px] font-normal text-muted-foreground/60">{types.length}</span>
              </button>
              {open && (
                <div className="space-y-0.5 mt-0.5">
                  {types.map(t => {
                    const meta = FIELD_TYPE_META[t]
                    const Icon = meta.icon
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={disabled}
                        onClick={() => onAdd(t)}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors',
                          'hover:bg-primary/5 hover:text-primary border border-transparent hover:border-primary/30',
                          meta.isSystem && 'text-primary/80',
                          disabled && 'opacity-50 cursor-not-allowed'
                        )}
                        title={meta.label}
                      >
                        <Icon size={12} className="text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{meta.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
