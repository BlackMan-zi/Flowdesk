import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listApprovalTemplates, createApprovalTemplate,
  updateApprovalTemplate, deleteApprovalTemplate
} from '../../api/forms'
import { listUsers, listRoles, listDepartments } from '../../api/users'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Card from '../../components/ui/Card'
import Table from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Textarea } from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import Badge from '../../components/ui/Badge'
import {
  Plus, Trash2, Search, X, Pencil, AlertTriangle,
  ChevronDown, Check, GripVertical, GitBranch
} from 'lucide-react'

// ── Token search ──────────────────────────────────────────────────────────────

function tokenMatch(query, ...fields) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = fields.filter(Boolean).join(' ').toLowerCase()
  return tokens.every(t => hay.includes(t))
}

// ── Approver Combobox ─────────────────────────────────────────────────────────

function ApproverCombobox({ step, onStepChange, users, roles, deptMap, hideSubmission = false }) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos]     = useState({ top: 0, left: 0, width: 200 })
  const triggerRef  = useRef(null)
  const dropdownRef = useRef(null)
  const inputRef    = useRef(null)

  const openDropdown = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) {
      const spaceBelow = window.innerHeight - r.bottom - 8
      if (spaceBelow < 200) {
        setPos({ bottom: window.innerHeight - r.top + 4, top: undefined, left: r.left, width: r.width })
      } else {
        setPos({ top: r.bottom + 4, bottom: undefined, left: r.left, width: r.width })
      }
    }
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 20)
  }

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      setOpen(false); setQuery('')
    }
    const onScroll = () => { setOpen(false); setQuery('') }
    document.addEventListener('click', onClickOutside)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('click', onClickOutside)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const STANDARD = [
    { id: 'manager',    label: 'Line Manager',       sublabel: "Submitter's direct manager",        role_type: 'Hierarchy',            hierarchy_level: 'manager',    role_id: null, specific_user_id: null },
    { id: 'sn_manager', label: 'SN Manager',         sublabel: "Manager's manager (second-level)",  role_type: 'Hierarchy',            hierarchy_level: 'sn_manager', role_id: null, specific_user_id: null },
    { id: 'hod',        label: 'Head of Department', sublabel: 'HOD',                               role_type: 'Hierarchy',            hierarchy_level: 'hod',        role_id: null, specific_user_id: null },
    ...(!hideSubmission ? [{ id: 'selected', label: 'Selected at Submission', sublabel: 'Submitter picks when submitting', role_type: 'SelectedAtSubmission', hierarchy_level: null, role_id: null, specific_user_id: null }] : []),
  ]

  const roleOptions = useMemo(() =>
    roles
      .filter(r => ['Functional', 'Executive'].includes(r.role_category))
      .map(r => ({
        id: `role_${r.id}`,
        label: r.name,
        sublabel: `${r.role_category} — signs by whoever holds this position`,
        role_type: r.role_category,
        hierarchy_level: null, role_id: r.id, specific_user_id: null,
      })),
    [roles]
  )

  const userOptions = useMemo(() =>
    users.map(u => {
      const dept    = deptMap[u.department_id]
      const topDept = dept?.parent_department_id ? deptMap[dept.parent_department_id] : dept
      const unit    = dept?.parent_department_id ? dept : null
      const deptStr = [topDept?.name, unit?.name].filter(Boolean).join(' › ')
      return {
        id: `user_${u.id}`,
        label: u.name,
        sublabel: [deptStr, u.email].filter(Boolean).join(' · '),
        searchText: `${u.name} ${u.email} ${deptStr} ${u.roles?.map(r => r.name).join(' ') || ''}`,
        role_type: 'SpecificUser',
        hierarchy_level: null, role_id: null, specific_user_id: u.id,
      }
    }),
    [users, deptMap]
  )

  const q = query.trim()
  const filteredStandard = q ? STANDARD.filter(o => tokenMatch(q, o.label, o.sublabel)) : STANDARD
  const filteredRoles    = q ? roleOptions.filter(o => tokenMatch(q, o.label, o.sublabel)) : roleOptions
  const filteredUsers    = q ? userOptions.filter(o => tokenMatch(q, o.label, o.sublabel, o.searchText)) : userOptions
  const hasResults = filteredStandard.length + filteredRoles.length + filteredUsers.length > 0

  const display = useMemo(() => {
    const rt = step.role_type
    if (rt === 'Hierarchy') {
      const m = { manager: 'Line Manager', sn_manager: 'SN Manager', hod: 'Head of Department' }
      return { label: m[step.hierarchy_level] || null, sub: null }
    }
    if (rt === 'SelectedAtSubmission') return { label: 'Selected at Submission', sub: 'Submitter picks when submitting' }
    if (rt === 'SpecificUser') {
      const u = users.find(x => x.id === step.specific_user_id)
      return { label: u?.name || null, sub: u?.email || null }
    }
    if (rt === 'Functional' || rt === 'Executive') {
      const r = roles.find(x => x.id === step.role_id)
      return { label: r?.name || null, sub: r ? `${r.role_category} — signs by position` : null }
    }
    return { label: null, sub: null }
  }, [step, users, roles])

  const select = (opt) => {
    onStepChange({
      role_type:        opt.role_type       ?? '',
      hierarchy_level:  opt.hierarchy_level ?? '',
      role_id:          opt.role_id         ?? '',
      specific_user_id: opt.specific_user_id ?? '',
    })
    setQuery(''); setOpen(false)
  }

  const isSelected = (opt) => {
    if (opt.role_type === 'Hierarchy')            return step.role_type === 'Hierarchy' && step.hierarchy_level === opt.hierarchy_level
    if (opt.role_type === 'SelectedAtSubmission') return step.role_type === 'SelectedAtSubmission'
    if (opt.role_type === 'SpecificUser')         return step.specific_user_id === opt.specific_user_id
    return step.role_id === opt.role_id
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className={cn(
          'w-full flex items-center gap-2 border rounded-md px-3 py-2 bg-background text-left transition-colors',
          open ? 'border-ring ring-1 ring-ring' : 'border-input hover:border-ring/60'
        )}
      >
        <Search size={13} className="text-muted-foreground flex-shrink-0" />
        <span className="flex-1 min-w-0">
          {display.label
            ? <>
                <span className="block text-sm font-medium text-foreground truncate">{display.label}</span>
                {display.sub && <span className="block text-xs text-muted-foreground truncate">{display.sub}</span>}
              </>
            : <span className="text-sm text-muted-foreground">Search by position, name, department…</span>}
        </span>
        <ChevronDown size={13} className={cn('text-muted-foreground flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top:    pos.top,
            bottom: pos.bottom,
            left:   pos.left,
            width:  pos.width,
            zIndex: 9999,
            maxHeight: 300,
          }}
          className="bg-popover border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 flex-shrink-0">
            <Search size={13} className="text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type position, name, department…"
              className="flex-1 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Options */}
          <div className="overflow-y-auto flex-1">
            {!hasResults && <p className="text-xs text-muted-foreground text-center py-5">No match for "{query}"</p>}
            {filteredStandard.length > 0 && (
              <ComboGroup label="Standard Hierarchy">
                {filteredStandard.map(opt => (
                  <ComboOpt key={opt.id} opt={opt} selected={isSelected(opt)} onSelect={() => select(opt)} />
                ))}
              </ComboGroup>
            )}
            {filteredRoles.length > 0 && (
              <ComboGroup label="Positions / Roles">
                {filteredRoles.map(opt => (
                  <ComboOpt key={opt.id} opt={opt} selected={isSelected(opt)} onSelect={() => select(opt)} />
                ))}
              </ComboGroup>
            )}
            {filteredUsers.length > 0 && (
              <ComboGroup label="Specific Person">
                {filteredUsers.map(opt => (
                  <ComboOpt key={opt.id} opt={opt} selected={isSelected(opt)} onSelect={() => select(opt)} />
                ))}
              </ComboGroup>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ComboGroup({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 pt-2.5 pb-1">{label}</p>
      {children}
    </div>
  )
}

function ComboOpt({ opt, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
        selected ? 'bg-primary/10 text-primary' : 'hover:bg-accent text-foreground'
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{opt.label}</p>
        {opt.sublabel && <p className="text-xs text-muted-foreground truncate">{opt.sublabel}</p>}
      </div>
      {selected && <Check size={13} className="text-primary flex-shrink-0" />}
    </button>
  )
}

// ── Step card ─────────────────────────────────────────────────────────────────

function StepCard({ step, onStepChange, onRemove, users, roles, deptMap,
                    onDragStart, onDragEnter, onDragEnd, isDragOver }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()}
      className={cn(
        'border rounded-xl bg-card shadow-sm transition-all select-none',
        isDragOver ? 'border-primary ring-2 ring-primary/20 opacity-70' : 'border-border'
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border rounded-t-xl cursor-grab active:cursor-grabbing">
        <GripVertical size={14} className="text-muted-foreground/50 flex-shrink-0" />
        <span className="text-xs font-bold text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">
          Step {step.step_order}
        </span>
        <div className="flex-1" />
        <button type="button" onClick={onRemove} className="p-1 text-muted-foreground/50 hover:text-destructive rounded transition-colors">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="p-3 space-y-2.5">
        <div>
          <p className="text-xs font-medium text-foreground mb-1">
            Approver *
            <span className="ml-1.5 font-normal text-muted-foreground">— choose a position so approval still works if the person changes</span>
          </p>
          <ApproverCombobox
            step={step}
            onStepChange={onStepChange}
            users={users}
            roles={roles}
            deptMap={deptMap}
          />
        </div>

        <div>
          <p className="text-xs font-medium text-foreground mb-1">
            Step Label <span className="font-normal text-muted-foreground">(optional — auto-filled from approver if blank)</span>
          </p>
          <input
            type="text"
            value={step.step_label}
            onChange={e => onStepChange({ step_label: e.target.value })}
            placeholder="e.g. CFO Sign-off, HR Clearance…"
            className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex items-center gap-5 pt-0.5">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={step.skip_if_missing}
              onChange={e => onStepChange({ skip_if_missing: e.target.checked })} className="rounded" />
            Skip if approver not found
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={step.delegation_allowed}
              onChange={e => onStepChange({ delegation_allowed: e.target.checked })} className="rounded" />
            Allow delegation
          </label>
        </div>
      </div>
    </div>
  )
}

// ── CC Recipient row ──────────────────────────────────────────────────────────

function CCRow({ cc, onCCChange, onRemove, users, roles, deptMap }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <ApproverCombobox
          step={cc}
          onStepChange={onCCChange}
          users={users}
          roles={roles}
          deptMap={deptMap}
          hideSubmission
        />
      </div>
      <button type="button" onClick={onRemove}
        className="mt-1 p-1.5 text-muted-foreground/50 hover:text-destructive rounded transition-colors flex-shrink-0">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ── Payload builder ───────────────────────────────────────────────────────────

function buildPayload(form) {
  return {
    ...form,
    steps: form.steps
      .filter(s => s.role_type)
      .map((s, idx) => ({
        step_order:       idx + 1,
        step_label:       s.step_label || null,
        role_type:        s.role_type,
        hierarchy_level:  s.role_type === 'Hierarchy' ? s.hierarchy_level : null,
        role_id:          ['Functional', 'Executive'].includes(s.role_type) ? (s.role_id || null) : null,
        specific_user_id: s.role_type === 'SpecificUser' ? (s.specific_user_id || null) : null,
        skip_if_missing:  s.skip_if_missing,
        delegation_allowed: s.delegation_allowed,
      })),
    cc_recipients: form.cc_recipients
      .filter(cc => cc.role_type)
      .map(cc => ({
        role_type:        cc.role_type,
        hierarchy_level:  cc.role_type === 'Hierarchy' ? cc.hierarchy_level : null,
        role_id:          ['Functional', 'Executive'].includes(cc.role_type) ? (cc.role_id || null) : null,
        specific_user_id: cc.role_type === 'SpecificUser' ? (cc.specific_user_id || null) : null,
        label:            cc.label || null,
      }))
  }
}

const EMPTY = { name: '', description: '', restart_on_correction: true, steps: [], cc_recipients: [] }
const EMPTY_STEP = {
  step_order: 1, step_label: '',
  role_type: '', hierarchy_level: '', role_id: '', specific_user_id: '',
  skip_if_missing: false, delegation_allowed: true,
}
const EMPTY_CC = { role_type: '', hierarchy_level: '', role_id: '', specific_user_id: '', label: '' }

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminApprovalTemplates() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState(null)
  const [form, setForm]                 = useState(EMPTY)
  const [error, setError]               = useState('')
  const [search, setSearch]             = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const dragIdx    = useRef(null)
  const [dragOver, setDragOver] = useState(null)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['approval-templates'],
    queryFn: () => listApprovalTemplates().then(r => r.data)
  })
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => listRoles().then(r => r.data),
    enabled: modalOpen
  })
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers().then(r => r.data),
    enabled: modalOpen
  })
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => listDepartments().then(r => r.data),
    enabled: modalOpen
  })

  const deptMap = useMemo(
    () => Object.fromEntries(departments.map(d => [d.id, d])),
    [departments]
  )

  const addStep = () => setForm(p => ({
    ...p,
    steps: [...p.steps, { ...EMPTY_STEP, step_order: p.steps.length + 1 }]
  }))

  const removeStep = (i) => setForm(p => ({
    ...p,
    steps: p.steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_order: idx + 1 }))
  }))

  const makeStepUpdater = (i) => (patch) => setForm(p => {
    const steps = p.steps.map((s, idx) => idx === i ? { ...s, ...patch } : s)
    return { ...p, steps }
  })

  const addCC    = () => setForm(p => ({ ...p, cc_recipients: [...p.cc_recipients, { ...EMPTY_CC }] }))
  const removeCC = (i) => setForm(p => ({ ...p, cc_recipients: p.cc_recipients.filter((_, idx) => idx !== i) }))
  const makeCCUpdater = (i) => (patch) => setForm(p => {
    const cc_recipients = p.cc_recipients.map((c, idx) => idx === i ? { ...c, ...patch } : c)
    return { ...p, cc_recipients }
  })

  const handleDragStart = (i) => { dragIdx.current = i }
  const handleDragEnter = (i) => setDragOver(i)
  const handleDragEnd   = () => {
    const from = dragIdx.current
    const to   = dragOver
    dragIdx.current = null
    setDragOver(null)
    if (from == null || to == null || from === to) return
    setForm(p => {
      const steps = [...p.steps]
      const [moved] = steps.splice(from, 1)
      steps.splice(to, 0, moved)
      return { ...p, steps: steps.map((s, idx) => ({ ...s, step_order: idx + 1 })) }
    })
  }

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(''); setModalOpen(true) }
  const openEdit = (t) => {
    setEditing(t)
    setForm({
      name: t.name,
      description: t.description || '',
      restart_on_correction: t.restart_on_correction,
      steps: t.steps.slice().sort((a, b) => a.step_order - b.step_order).map(s => ({
        step_order:       s.step_order,
        step_label:       s.step_label || '',
        role_type:        s.role_type,
        hierarchy_level:  s.hierarchy_level || '',
        role_id:          s.role_id || '',
        specific_user_id: s.specific_user_id || '',
        skip_if_missing:  s.skip_if_missing,
        delegation_allowed: s.delegation_allowed,
      })),
      cc_recipients: (t.cc_recipients || []).map(cc => ({
        role_type:        cc.role_type,
        hierarchy_level:  cc.hierarchy_level || '',
        role_id:          cc.role_id || '',
        specific_user_id: cc.specific_user_id || '',
        label:            cc.label || '',
      }))
    })
    setError('')
    setModalOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = buildPayload(form)
      return editing ? updateApprovalTemplate(editing.id, payload) : createApprovalTemplate(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries(['approval-templates'])
      setModalOpen(false)
      setForm(EMPTY)
      toast.success(editing ? `"${editing.name}" updated.` : `Template "${form.name}" created.`)
    },
    onError: (err) => {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? 'Validation error — make sure every approver and recipient has a selection.'
        : (detail || 'Save failed.')
      setError(msg)
      toast.error(msg)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteApprovalTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries(['approval-templates'])
      setDeleteTarget(null)
      toast.success('Template deleted.')
    },
    onError: () => toast.error('Delete failed.')
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return templates
    return templates.filter(t => tokenMatch(search,
      t.name, t.description,
      ...(t.steps?.map(s => [s.step_label, s.role_type, s.hierarchy_level].filter(Boolean).join(' ')) || [])
    ))
  }, [templates, search])

  const stepSummary = (t) => {
    if (!t.steps?.length) return <span className="text-muted-foreground text-xs">No steps</span>
    return (
      <div className="flex flex-wrap gap-1">
        {t.steps.slice().sort((a, b) => a.step_order - b.step_order).map((s, i) => {
          const label = s.step_label || (
            s.role_type === 'Hierarchy'
              ? ({ manager: 'Line Mgr', sn_manager: 'SN Mgr', hod: 'HOD' }[s.hierarchy_level] || s.hierarchy_level)
              : s.role_type === 'SelectedAtSubmission' ? 'At Submission'
              : s.role_type === 'SpecificUser' ? 'Specific User'
              : s.role_type
          )
          return <Badge key={i} label={`${i + 1}. ${label}`} />
        })}
      </div>
    )
  }

  const columns = [
    { key: 'name',    label: 'Template Name' },
    { key: 'steps',   label: 'Steps',   render: stepSummary },
    { key: 'cc',      label: 'CC',      render: r => r.cc_recipients?.length
        ? <span className="text-xs text-muted-foreground">{r.cc_recipients.length} recipient{r.cc_recipients.length !== 1 ? 's' : ''}</span>
        : <span className="text-muted-foreground text-xs">—</span>
    },
    { key: 'restart', label: 'Restart on Correction', render: r => <Badge label={r.restart_on_correction ? 'Yes' : 'No'} /> },
    { key: 'actions', label: '', render: r => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
          <Pencil size={13} /> Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(r)} className="text-destructive hover:text-destructive/80">
          <Trash2 size={13} /> Delete
        </Button>
      </div>
    )}
  ]

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <GitBranch size={20} className="text-muted-foreground" />
            Approval Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={14} /> New Template
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, step label, role…"
          className="w-full pl-9 pr-8 h-9 border border-input rounded-md text-sm bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>
      {search && <p className="text-xs text-muted-foreground -mt-2">{filtered.length} of {templates.length} templates</p>}

      <Card>
        {isLoading
          ? <div className="flex justify-center py-12"><Spinner /></div>
          : <Table columns={columns} rows={filtered} emptyMessage="No templates match your search." />
        }
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit — ${editing.name}` : 'New Approval Template'}
        size="xl"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Template Name *"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer pt-6 select-none">
              <input
                type="checkbox"
                checked={form.restart_on_correction}
                onChange={e => setForm(p => ({ ...p, restart_on_correction: e.target.checked }))}
                className="rounded"
              />
              Restart approval on correction
            </label>
          </div>

          <Textarea
            label="Description"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={2}
          />

          {/* Steps */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-3">
              Approval Steps
              {form.steps.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {form.steps.length} step{form.steps.length !== 1 ? 's' : ''} · drag <GripVertical size={11} className="inline" /> to reorder
                </span>
              )}
            </p>

            <div className="space-y-2.5">
              {form.steps.map((step, i) => (
                <StepCard
                  key={i}
                  step={step}
                  onStepChange={makeStepUpdater(i)}
                  onRemove={() => removeStep(i)}
                  users={users}
                  roles={roles}
                  deptMap={deptMap}
                  onDragStart={() => handleDragStart(i)}
                  onDragEnter={() => handleDragEnter(i)}
                  onDragEnd={handleDragEnd}
                  isDragOver={dragOver === i}
                />
              ))}
              {form.steps.length === 0 && (
                <div className="py-8 border border-dashed border-border rounded-xl text-center">
                  <p className="text-sm text-muted-foreground">No steps yet. Add your first approval step below.</p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={addStep}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Plus size={15} /> Add Step
            </button>
          </div>

          {/* CC Recipients */}
          <div className="border-t border-border pt-4">
            <div className="mb-2">
              <p className="text-sm font-semibold text-foreground">Copy Recipients</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                People who receive a copy of the completed document but play no role in approval.
              </p>
            </div>

            <div className="space-y-2">
              {form.cc_recipients.map((cc, i) => (
                <CCRow
                  key={i}
                  cc={cc}
                  onCCChange={makeCCUpdater(i)}
                  onRemove={() => removeCC(i)}
                  users={users}
                  roles={roles}
                  deptMap={deptMap}
                />
              ))}
              {form.cc_recipients.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No copy recipients set.</p>
              )}
            </div>

            <button
              type="button"
              onClick={addCC}
              className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <Plus size={14} /> Add recipient
            </button>
            {form.cc_recipients.some(cc => !cc.role_type) && (
              <p className="mt-1.5 text-xs text-amber-500">Rows with no selection will be ignored on save.</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : 'Create Template'}
            </Button>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Template" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">
              Are you sure you want to delete <span className="font-semibold">"{deleteTarget?.name}"</span>?
              This cannot be undone.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
              loading={deleteMutation.isPending}
            >
              Delete
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
