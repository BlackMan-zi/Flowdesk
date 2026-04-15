import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  listFormDefinitions, createFormDefinition, updateFormDefinition, deleteFormDefinition,
  listApprovalTemplates
} from '../../api/forms'
import { listDepartments } from '../../api/users'
import { Card, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/Modal'
import { Alert } from '../../components/ui/alert'
import { cn } from '../../lib/utils'
import {
  Plus, LayoutTemplate, Settings, Search, X, Trash2, AlertTriangle,
  ChevronDown, Building2, CheckSquare, Square, Eye, EyeOff, FolderOpen
} from 'lucide-react'

// ── Department multi-select picker ────────────────────────────────────────────

function DepartmentPicker({ departments, selected, onChange }) {
  const [search, setSearch] = useState('')

  const topLevel = useMemo(() =>
    departments.filter(d => !d.parent_department_id).sort((a, b) => a.name.localeCompare(b.name)),
    [departments]
  )
  const unitsOf = (id) =>
    departments.filter(d => d.parent_department_id === id).sort((a, b) => a.name.localeCompare(b.name))

  const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (d) => !tokens.length || tokens.every(t => d.name.toLowerCase().includes(t))

  const visibleTop = topLevel.filter(d => matches(d) || unitsOf(d.id).some(matches))

  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id))
    else onChange([...selected, id])
  }

  const toggleAll = (ids) => {
    const allSelected = ids.every(id => selected.includes(id))
    if (allSelected) onChange(selected.filter(id => !ids.includes(id)))
    else onChange([...new Set([...selected, ...ids])])
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <Search size={13} className="text-muted-foreground flex-shrink-0" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search departments…"
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-52 overflow-y-auto divide-y divide-border/50">
        {visibleTop.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No departments found</p>
        ) : visibleTop.map(dept => {
          const deptUnits = unitsOf(dept.id).filter(u => !tokens.length || matches(u) || matches(dept))
          const allIds = [dept.id, ...deptUnits.map(u => u.id)]
          const allSelected = allIds.every(id => selected.includes(id))
          const someSelected = allIds.some(id => selected.includes(id))

          return (
            <div key={dept.id}>
              {/* Top-level dept row */}
              <div
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer group"
                onClick={() => toggleAll(allIds)}
              >
                <div className={cn(
                  'w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                  allSelected
                    ? 'border-primary bg-primary'
                    : someSelected
                    ? 'border-primary bg-primary/20'
                    : 'border-muted-foreground/40'
                )}>
                  {allSelected && <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
                  {!allSelected && someSelected && <div className="w-1.5 h-0.5 bg-primary rounded" />}
                </div>
                <Building2 size={13} className="text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-foreground flex-1">{dept.name}</span>
                <span className="text-xs text-muted-foreground">{deptUnits.length} units</span>
              </div>

              {/* Units */}
              {deptUnits.map(unit => (
                <div
                  key={unit.id}
                  className="flex items-center gap-2 pl-8 pr-3 py-2 hover:bg-muted/40 cursor-pointer border-l-2 border-border/50 ml-5"
                  onClick={() => toggle(unit.id)}
                >
                  <div className={cn(
                    'w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                    selected.includes(unit.id)
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/40'
                  )}>
                    {selected.includes(unit.id) && (
                      <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-foreground">{unit.name}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Selection summary */}
      {selected.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-primary/5 text-xs">
          <span className="text-primary font-medium">{selected.length} selected</span>
          <button onClick={() => onChange([])} className="text-muted-foreground hover:text-destructive">
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

// ── Selected departments badge list ───────────────────────────────────────────

function SelectedDeptBadges({ selected, departments, onRemove }) {
  if (!selected.length) return null
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d]))
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {selected.map(id => {
        const dept = deptMap[id]
        if (!dept) return null
        const parent = dept.parent_department_id ? deptMap[dept.parent_department_id] : null
        return (
          <span
            key={id}
            className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full border border-primary/20"
          >
            {parent ? `${parent.name} › ${dept.name}` : dept.name}
            <button onClick={() => onRemove(id)} className="hover:text-destructive ml-0.5">
              <X size={10} />
            </button>
          </span>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '', description: '', code_suffix: '',
  visibility: 'all_users',
  visible_department_ids: [],
  allow_backdating: false,
  allow_attachments: true,
  approval_template_id: '',
  fields: []
}

export default function AdminFormDefinitions() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  const { data: defs = [], isLoading } = useQuery({
    queryKey: ['form-definitions'],
    queryFn: () => listFormDefinitions().then(r => r.data)
  })
  const { data: templates = [] } = useQuery({
    queryKey: ['approval-templates'],
    queryFn: () => listApprovalTemplates().then(r => r.data),
    enabled: modalOpen
  })
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => listDepartments().then(r => r.data),
    enabled: modalOpen
  })

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
  const setBool = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.checked }))

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (d) => {
    setEditing(d)
    setForm({
      name: d.name,
      description: d.description || '',
      code_suffix: d.code_suffix,
      visibility: d.visibility,
      visible_department_ids: d.visible_department_ids || [],
      allow_backdating: d.allow_backdating,
      allow_attachments: d.allow_attachments,
      approval_template_id: d.approval_template_id || '',
      fields: d.fields || []
    })
    setError('')
    setModalOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        approval_template_id: form.approval_template_id || null,
        visible_department_ids: form.visibility === 'specific_departments'
          ? form.visible_department_ids
          : null,
        fields: form.fields.map((f, idx) => ({
          ...f,
          display_order: idx,
          options: f.options
            ? (typeof f.options === 'string' ? f.options.split(',').map(s => s.trim()) : f.options)
            : null
        }))
      }
      return editing ? updateFormDefinition(editing.id, payload) : createFormDefinition(payload)
    },
    onSuccess: () => { qc.invalidateQueries(['form-definitions']); setModalOpen(false) },
    onError: (err) => setError(err.response?.data?.detail || 'Save failed.')
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteFormDefinition(id),
    onSuccess: () => { qc.invalidateQueries(['form-definitions']); setDeleteTarget(null); setDeleteError('') },
    onError: (err) => setDeleteError(err.response?.data?.detail || 'Delete failed.')
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return defs
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean)
    return defs.filter(d => {
      const hay = [d.name, d.description, d.code_suffix, d.approval_template?.name, d.visibility]
        .filter(Boolean).join(' ').toLowerCase()
      return tokens.every(t => hay.includes(t))
    })
  }, [defs, search])

  // Visibility icon
  const VisIcon = ({ v }) => v === 'all_users'
    ? <Eye size={13} className="text-muted-foreground" />
    : <EyeOff size={13} className="text-amber-500" />

  return (
    <div className="max-w-5xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Form Definitions</h1>
        <Button onClick={openCreate}>
          <Plus size={14} className="mr-1.5" /> New Form Type
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, code, approval template…"
          className="w-full pl-9 pr-8 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>
      {search && <p className="text-xs text-muted-foreground -mt-2">{filtered.length} of {defs.length} forms</p>}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {search ? 'No forms match your search.' : 'No form definitions yet.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Form Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Code</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fields</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Visibility</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Approval Workflow</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FolderOpen size={14} className="text-primary flex-shrink-0" />
                        <span className="font-medium text-foreground">{r.name}</span>
                      </div>
                      {r.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 pl-5 line-clamp-1">{r.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded border border-border">
                        {r.code_suffix}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.fields?.filter(f => f.is_active !== false).length || 0}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <VisIcon v={r.visibility} />
                        <span className={cn(
                          'text-xs',
                          r.visibility === 'all_users' ? 'text-muted-foreground' : 'text-amber-600 font-medium'
                        )}>
                          {r.visibility === 'all_users' ? 'All users' : `${(r.visible_department_ids || []).length} dept(s)`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {r.approval_template?.name
                        ? <Badge variant="outline" className="text-xs font-normal">{r.approval_template.name}</Badge>
                        : <span className="text-xs text-muted-foreground">None</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => navigate(`/admin/form-definitions/${r.id}/builder`)}
                        >
                          <LayoutTemplate size={12} className="mr-1" /> Design Layout
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}>
                          <Settings size={13} />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => { setDeleteTarget(r); setDeleteError('') }}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Form Definition' : 'Create Form Definition'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name + Code */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <label className="text-sm font-medium text-foreground">Form Name <span className="text-destructive">*</span></label>
                <input
                  value={form.name}
                  onChange={set('name')}
                  placeholder="e.g. Leave Request Form"
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Code Suffix <span className="text-destructive">*</span></label>
                <input
                  value={form.code_suffix}
                  onChange={set('code_suffix')}
                  placeholder="e.g. LEAVE"
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground font-mono uppercase focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea
                value={form.description}
                onChange={set('description')}
                rows={2}
                placeholder="Brief description of this form's purpose…"
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {/* Approval template + Visibility */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Approval Workflow</label>
                <select
                  value={form.approval_template_id}
                  onChange={set('approval_template_id')}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">None</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Visibility</label>
                <select
                  value={form.visibility}
                  onChange={set('visibility')}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all_users">All Users</option>
                  <option value="specific_departments">Specific Departments</option>
                </select>
              </div>
            </div>

            {/* Department picker — shown when specific_departments */}
            {form.visibility === 'specific_departments' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    Accessible Departments
                    <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                      — Only users in these departments will see this form
                    </span>
                  </label>
                </div>
                <DepartmentPicker
                  departments={departments}
                  selected={form.visible_department_ids}
                  onChange={ids => setForm(p => ({ ...p, visible_department_ids: ids }))}
                />
                <SelectedDeptBadges
                  selected={form.visible_department_ids}
                  departments={departments}
                  onRemove={id => setForm(p => ({
                    ...p,
                    visible_department_ids: p.visible_department_ids.filter(x => x !== id)
                  }))}
                />
                {form.visible_department_ids.length === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                    No departments selected — the form will be hidden from all users until at least one is chosen.
                  </p>
                )}
              </div>
            )}

            {/* Toggles */}
            <div className="flex gap-6 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div
                  className={cn(
                    'w-9 h-5 rounded-full transition-colors relative',
                    form.allow_attachments ? 'bg-primary' : 'bg-muted'
                  )}
                  onClick={() => setForm(p => ({ ...p, allow_attachments: !p.allow_attachments }))}
                >
                  <div className={cn(
                    'w-3.5 h-3.5 bg-white rounded-full absolute top-0.75 transition-transform shadow-sm',
                    form.allow_attachments ? 'translate-x-4' : 'translate-x-0.5'
                  )} style={{ top: '3px' }} />
                </div>
                <span className="text-sm text-foreground">Allow attachments</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div
                  className={cn(
                    'w-9 h-5 rounded-full transition-colors relative',
                    form.allow_backdating ? 'bg-primary' : 'bg-muted'
                  )}
                  onClick={() => setForm(p => ({ ...p, allow_backdating: !p.allow_backdating }))}
                >
                  <div className={cn(
                    'w-3.5 h-3.5 bg-white rounded-full absolute top-0.75 transition-transform shadow-sm',
                    form.allow_backdating ? 'translate-x-4' : 'translate-x-0.5'
                  )} style={{ top: '3px' }} />
                </div>
                <span className="text-sm text-foreground">Allow backdating</span>
              </label>
            </div>

            {/* Info note */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 text-sm text-primary">
              Fields and PDF layout are managed in the <strong>Design Layout</strong> editor after saving the form settings.
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : 'Create Form'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => { setDeleteTarget(null); setDeleteError('') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Form Definition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm text-foreground space-y-1">
                <p>Delete <strong>"{deleteTarget?.name}"</strong>?</p>
                <p className="text-muted-foreground text-xs">
                  This cannot be undone. Any forms currently under review will be cancelled.
                </p>
              </div>
            </div>
            {deleteError && (
              <Alert variant="destructive"><span>{deleteError}</span></Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setDeleteTarget(null); setDeleteError('') }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
              loading={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
