import React, { useState, useMemo, useRef } from 'react'
import { Search, X } from 'lucide-react'

/**
 * Searchable single-select combobox. Token-based filter — query is split on
 * whitespace, every token must appear somewhere in label/sublabel/searchText.
 *
 * items: [{ id, label, sublabel?, searchText? }]
 * selectedId / selectedLabel: controlled selection
 * onSelect(id, label): pass (null, null) to clear
 */
export default function SearchCombobox({
  items,
  selectedId,
  selectedLabel,
  onSelect,
  placeholder = 'Search…',
  maxUnfilteredItems = 50,
  size = 'md',
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!tokens.length) return items.slice(0, maxUnfilteredItems)
    return items.filter(item => {
      const hay = `${item.label} ${item.sublabel || ''} ${item.searchText || ''}`.toLowerCase()
      return tokens.every(t => hay.includes(t))
    })
  }, [query, items, maxUnfilteredItems])

  const padY = size === 'sm' ? 'py-1.5' : 'py-2'
  const text = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
        <input
          ref={inputRef}
          value={selectedId ? (selectedLabel || selectedId) : query}
          onChange={e => {
            setQuery(e.target.value)
            if (selectedId) onSelect(null, null)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder}
          className={`w-full border border-input rounded-md pl-8 pr-7 ${padY} ${text} bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring`}
        />
        {selectedId && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onSelect(null, null); setQuery('') }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear selection"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-2 text-center">No matches</p>
          ) : filtered.map(item => (
            <button
              key={item.id}
              type="button"
              onMouseDown={e => {
                e.preventDefault()
                onSelect(item.id, item.label)
                setQuery('')
                setOpen(false)
              }}
              className="w-full text-left px-3 py-2 hover:bg-muted flex flex-col gap-0"
            >
              <span className="text-sm font-medium text-foreground">{item.label}</span>
              {item.sublabel && <span className="text-xs text-muted-foreground">{item.sublabel}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
