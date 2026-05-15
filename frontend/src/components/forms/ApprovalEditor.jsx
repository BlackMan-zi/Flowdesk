import React, { useState, useMemo, useRef } from 'react'
import { cn } from '../../lib/utils'
import {
  Plus, X, ChevronUp, ChevronDown, Workflow, Search,
  GitBranch, Briefcase, User as UserIcon,
} from 'lucide-react'

// ── Hierarchy labels ──────────────────────────────────────────────────────────

const HIERARCHY_LABELS = {
  manager:    'Line Manager',
  sn_manager: 'Senior Manager',
  hod:        'Head of Department',
}

// ── Search combobox ───────────────────────────────────────────────────────────

function SearchCombobox({ items, selectedId, selectedName, onSelect, placeholder = 'Search…' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!tokens.length) return items.slice(0, 25)
    return items.filter(item =>
      tokens.every(t =>
        item.label.toLowerCase().includes(t) ||
        (item.sublabel || '').toLowerCase().includes(t)
      )
    )
  }, [query, items])

  return (
    <div className="relative">
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
        <input
          ref={inputRef}
          value={selectedId ? (selectedName || selectedId) : query}
          onChange={e => {
            setQuery(e.target.value)
            if (selectedId) onSelect(null, null)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder}
          className="w-full border border-border bg-background text-foreground rounded-md pl-7 pr-6 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      {selectedId && (
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); onSelect(null, null); setQuery('') }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X size={11} />
        </button>
      )}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-popover border border-border rounded-md shadow-lg max-h-44 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2.5 py-2 text-center">No matches</p>
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
              className="w-full text-left px-2.5 py-1.5 hover:bg-muted flex flex-col gap-0"
            >
              <span className="text-xs font-medium text-foreground">{item.label}</span>
              {item.sublabel && <span className="text-[10px] text-muted-foreground">{item.sublabel}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Step card ────────────────────────────────────────────────────────────────

function StepCard({ step, index, isEditing, onToggleEdit, onUpdate, onDelete, onMoveUp, onMoveDown, userItems, roleItems }) {
  const sourceLabel = step.source_type === 'hierarchy'     ? 'Hierarchy'
                    : step.source_type === 'role'          ? 'By Role'
                    :                                        'Specific User'
  const SourceIcon  = step.source_type === 'hierarchy'     ? GitBranch
                    : step.source_type === 'role'          ? Briefcase
                    :                                        UserIcon

  const detail = step.source_type === 'hierarchy'     ? (HIERARCHY_LABELS[step.hierarchy_level] || step.hierarchy_level)
               : step.source_type === 'role'          ? (step.role_name || '—')
               : step.source_type === 'specific_user' ? (step.specific_user_name || '—')
               :                                        '—'

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div
        className="flex items-center gap-2 px-2.5 py-2 hover:bg-muted/50 cursor-pointer select-none transition-colors"
        onClick={onToggleEdit}
      >
        <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{step.step_label || `Step ${index + 1}`}</p>
          <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
            <SourceIcon size={9} className="opacity-70" />
            {sourceLabel} · {detail}
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {onMoveUp   && <button type="button" onClick={onMoveUp}   className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"><ChevronUp   size={11} /></button>}
          {onMoveDown && <button type="button" onClick={onMoveDown} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"><ChevronDown size={11} /></button>}
          <button type="button" onClick={onDelete} className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"><X size={11} /></button>
        </div>
      </div>

      {isEditing && (
        <div className="p-2.5 space-y-2.5 border-t border-border bg-card/50">
          <label className="block">
            <span className="text-[10px] font-semibold text-muted-foreground block mb-0.5 uppercase tracking-wide">Step Label</span>
            <input
              type="text"
              value={step.step_label}
              onChange={e => onUpdate({ step_label: e.target.value })}
              placeholder="e.g. Line Manager Approval"
              className="w-full border border-border bg-background text-foreground rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <div>
            <span className="text-[10px] font-semibold text-muted-foreground block mb-1 uppercase tracking-wide">Approver Source</span>
            <div className="flex gap-1">
              {[
                { id: 'hierarchy',     label: 'Hierarchy' },
                { id: 'role',          label: 'Role'      },
                { id: 'specific_user', label: 'User'      },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdate({ source_type: opt.id })}
                  className={cn(
                    'flex-1 py-1 rounded-md text-[10px] font-semibold border transition-colors',
                    step.source_type === opt.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {step.source_type === 'hierarchy' && (
            <label className="block">
              <span className="text-[10px] font-semibold text-muted-foreground block mb-0.5 uppercase tracking-wide">Hierarchy Level</span>
              <select
                value={step.hierarchy_level || 'manager'}
                onChange={e => onUpdate({ hierarchy_level: e.target.value })}
                className="w-full border border-border bg-background text-foreground rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="manager">Line Manager</option>
                <option value="sn_manager">Senior Manager</option>
                <option value="hod">Head of Department</option>
              </select>
            </label>
          )}

          {step.source_type === 'role' && (
            <label className="block">
              <span className="text-[10px] font-semibold text-muted-foreground block mb-0.5 uppercase tracking-wide">Role / Position</span>
              <SearchCombobox
                items={roleItems}
                selectedId={step.role_id}
                selectedName={step.role_name}
                onSelect={(id, name) => onUpdate({ role_id: id, role_name: name })}
                placeholder="Search roles…"
              />
            </label>
          )}

          {step.source_type === 'specific_user' && (
            <label className="block">
              <span className="text-[10px] font-semibold text-muted-foreground block mb-0.5 uppercase tracking-wide">Specific User</span>
              <SearchCombobox
                items={userItems}
                selectedId={step.specific_user_id}
                selectedName={step.specific_user_name}
                onSelect={(id, name) => onUpdate({ specific_user_id: id, specific_user_name: name })}
                placeholder="Search by name or email…"
              />
            </label>
          )}

          <label className="flex items-center gap-2 cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={step.is_required !== false}
              onChange={e => onUpdate({ is_required: e.target.checked })}
              className="rounded accent-primary w-3 h-3 flex-shrink-0"
            />
            <span className="text-[10px] text-muted-foreground">
              <strong>Required</strong> — sign-off must be obtained (uncheck to make optional)
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={!!step.skip_if_missing}
              onChange={e => onUpdate({ skip_if_missing: e.target.checked })}
              className="rounded accent-primary w-3 h-3 flex-shrink-0"
            />
            <span className="text-[10px] text-muted-foreground">Skip step if approver not found in hierarchy</span>
          </label>
        </div>
      )}
    </div>
  )
}

// ── Approval editor ───────────────────────────────────────────────────────────

export default function ApprovalEditor({ steps, onChange, users, roles }) {
  const [editingIdx, setEditingIdx] = useState(null)

  const userItems = useMemo(
    () => users.map(u => ({ id: u.id, label: u.name, sublabel: u.email })),
    [users]
  )
  const roleItems = useMemo(
    () => roles.map(r => ({ id: r.id, label: r.name, sublabel: r.category })),
    [roles]
  )

  const addStep = () => {
    const newStep = {
      id: `new-${Date.now()}`,
      step_order: steps.length + 1,
      step_label: '',
      source_type: 'hierarchy',
      hierarchy_level: 'manager',
      role_id: null, role_name: null,
      specific_user_id: null, specific_user_name: null,
      skip_if_missing: false,
      is_required: true,
    }
    onChange([...steps, newStep])
    setEditingIdx(steps.length)
  }
  const updateStep = (i, updates) =>
    onChange(steps.map((s, idx) => idx === i ? { ...s, ...updates } : s))
  const deleteStep = (i) => {
    const next = steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_order: idx + 1 }))
    onChange(next)
    setEditingIdx(p => (p === i ? null : (p != null && p > i ? p - 1 : p)))
  }
  const moveStep = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    ;[next[i], next[j]] = [next[j], next[i]]
    next.forEach((_, idx) => { next[idx] = { ...next[idx], step_order: idx + 1 } })
    onChange(next)
    setEditingIdx(j)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Workflow size={14} className="text-muted-foreground" />
            Approval Workflow
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Steps run top-to-bottom after the initiator submits.
          </p>
        </div>
        <button
          onClick={addStep}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80"
        >
          <Plus size={12} /> Add step
        </button>
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => (
          <StepCard
            key={step.id}
            step={step}
            index={i}
            isEditing={editingIdx === i}
            onToggleEdit={() => setEditingIdx(editingIdx === i ? null : i)}
            onUpdate={updates => updateStep(i, updates)}
            onDelete={() => deleteStep(i)}
            onMoveUp={i > 0 ? () => moveStep(i, -1) : null}
            onMoveDown={i < steps.length - 1 ? () => moveStep(i, 1) : null}
            userItems={userItems}
            roleItems={roleItems}
          />
        ))}
        {steps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center border-2 border-dashed border-border rounded-lg">
            <Workflow size={20} className="text-muted-foreground/40" />
            <p className="text-xs text-foreground">No approval steps</p>
            <p className="text-[10px] text-muted-foreground">Click "Add step" to build your workflow.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Adapter — turns local step shape into the API payload shape.
export function stepsToApiPayload(steps) {
  return steps.map((s, idx) => ({
    step_order: idx + 1,
    step_label: s.step_label || null,
    role_type:
      s.source_type === 'hierarchy'     ? 'Hierarchy'     :
      s.source_type === 'specific_user' ? 'SpecificUser'  :
                                          'Functional',
    role_id:          s.source_type === 'role'          ? (s.role_id || null) : null,
    specific_user_id: s.source_type === 'specific_user' ? (s.specific_user_id || null) : null,
    hierarchy_level:  s.source_type === 'hierarchy'     ? (s.hierarchy_level || 'manager') : null,
    skip_if_missing:  !!s.skip_if_missing,
    delegation_allowed: true,
    is_required:      s.is_required !== false,
  }))
}

// Adapter — turns the API step shape into local steps for the editor.
export function stepsFromApi(apiSteps = [], roles = [], users = []) {
  return apiSteps.map((s, idx) => {
    const source_type =
      s.role_type === 'Hierarchy'    ? 'hierarchy'     :
      s.role_type === 'SpecificUser' ? 'specific_user' :
                                       'role'
    const role = roles.find(r => r.id === s.role_id)
    const user = users.find(u => u.id === s.specific_user_id)
    return {
      id: s.id || `existing-${idx}`,
      step_order: s.step_order ?? (idx + 1),
      step_label: s.step_label || '',
      source_type,
      hierarchy_level: s.hierarchy_level || (source_type === 'hierarchy' ? 'manager' : null),
      role_id: s.role_id || null,
      role_name: role?.name || null,
      specific_user_id: s.specific_user_id || null,
      specific_user_name: user?.name || null,
      skip_if_missing: !!s.skip_if_missing,
      is_required: s.is_required !== false,
    }
  })
}
