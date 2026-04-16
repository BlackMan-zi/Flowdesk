import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable
} from '@dnd-kit/core'
import {
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listUsers, updateUser
} from '../../api/users'
import { Card, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/Modal'
import { Alert } from '../../components/ui/alert'
import { cn } from '../../lib/utils'
import {
  Search, X, Pencil, Trash2, Plus, ChevronRight, Users, Building2,
  AlertTriangle, Network, List, GripVertical, UserCircle2, ChevronDown,
  ChevronUp, MoveRight
} from 'lucide-react'

// ── Draggable user card ───────────────────────────────────────────────────────

function DraggableUser({ user, isDragging }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: user.id })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : 'auto',
  } : undefined

  const initials = user.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background border border-border',
        'cursor-grab active:cursor-grabbing select-none transition-shadow',
        'hover:border-primary/40 hover:shadow-sm'
      )}
    >
      <div {...listeners} {...attributes} className="touch-none">
        <GripVertical size={11} className="text-muted-foreground/50" />
      </div>
      <div className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[9px] font-bold flex-shrink-0">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
      </div>
    </div>
  )
}

// ── Droppable department card ─────────────────────────────────────────────────

function DroppableCard({ dept, users, isUnit, expanded, onToggle, onEdit, onDelete, onAddUnit, isOver }) {
  const { setNodeRef } = useDroppable({ id: dept.id })

  const initials = dept.name.slice(0, 2).toUpperCase()

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'border rounded-xl transition-all',
        isUnit ? 'border-border/60 bg-card' : 'border-border bg-card shadow-sm',
        isOver && 'border-primary ring-2 ring-primary/20 bg-primary/5'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
            isUnit
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary/15 text-primary'
          )}>
            {isUnit ? <ChevronRight size={14} /> : initials}
          </div>
          <div className="min-w-0">
            <p className={cn('font-medium truncate', isUnit ? 'text-sm text-foreground' : 'text-sm text-foreground')}>
              {dept.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {users.length} member{users.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Actions (visible on hover) */}
          {!isUnit && (
            <button
              onClick={onAddUnit}
              title="Add unit"
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
            >
              <Plus size={12} />
            </button>
          )}
          <button
            onClick={onEdit}
            title="Edit"
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 size={12} />
          </button>
          {users.length > 0 && (
            <button
              onClick={onToggle}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Drop zone hint */}
      {isOver && (
        <div className="mx-3 mb-2 border-2 border-dashed border-primary/40 rounded-lg py-2 flex items-center justify-center gap-1.5 text-xs text-primary">
          <MoveRight size={12} />
          Drop to assign here
        </div>
      )}

      {/* Users */}
      {expanded && users.length > 0 && (
        <div className="px-3 pb-3 space-y-1.5">
          {users.map(u => (
            <DraggableUser key={u.id} user={u} />
          ))}
        </div>
      )}

      {/* Empty drop hint */}
      {!isOver && users.length === 0 && (
        <div className="mx-3 mb-3 border border-dashed border-border/60 rounded-lg py-3 flex items-center justify-center text-xs text-muted-foreground/60">
          Drop users here
        </div>
      )}
    </div>
  )
}

// ── Drag overlay user card ────────────────────────────────────────────────────

function UserOverlayCard({ user }) {
  if (!user) return null
  const initials = user.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background border-2 border-primary shadow-xl rotate-2 w-48">
      <GripVertical size={11} className="text-muted-foreground/50" />
      <div className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[9px] font-bold">
        {initials}
      </div>
      <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
    </div>
  )
}

// ── List view (original) ──────────────────────────────────────────────────────

function DeptRow({ dept, isUnit, onEdit, onDelete, onAddUnit }) {
  return (
    <div className={cn(
      'flex items-center justify-between py-3 group transition-colors hover:bg-muted/30',
      isUnit ? 'pl-10 pr-4 border-l-2 border-border/50 ml-6' : 'px-5'
    )}>
      <div className="flex items-center gap-3 min-w-0">
        {isUnit
          ? <ChevronRight size={13} className="text-muted-foreground/50 flex-shrink-0" />
          : <Building2 size={15} className="text-primary flex-shrink-0" />
        }
        <span className={cn('font-medium truncate text-sm', isUnit ? 'text-foreground' : 'text-foreground')}>
          {dept.name}
        </span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
          <Users size={11} />
          {dept.member_count || 0}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isUnit && (
          <button
            onClick={onAddUnit}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 px-2 py-1 rounded hover:bg-primary/5 transition-colors"
          >
            <Plus size={12} /> Add Unit
          </button>
        )}
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminDepartments() {
  const qc = useQueryClient()
  const [view, setView] = useState('chart')          // 'list' | 'chart'
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [parentPreset, setParentPreset] = useState('')
  const [form, setForm] = useState({ name: '', parent_department_id: '' })
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState({})        // deptId → bool
  const [activeUserId, setActiveUserId] = useState(null)
  const [overDeptId, setOverDeptId] = useState(null)
  const [reassignPreview, setReassignPreview] = useState(null) // { user, fromDept, toDept }

  const { data: departments = [], isLoading: deptLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => listDepartments().then(r => r.data)
  })
  const { data: users = [], isLoading: userLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers().then(r => r.data)
  })

  const isLoading = deptLoading || userLoading

  const topLevel = useMemo(() =>
    departments.filter(d => !d.parent_department_id).sort((a, b) => a.name.localeCompare(b.name)),
    [departments]
  )
  const unitsOf = (deptId) =>
    departments.filter(d => d.parent_department_id === deptId).sort((a, b) => a.name.localeCompare(b.name))

  const usersInDept = (deptId) =>
    users.filter(u => u.department_id === deptId)

  const deptMap = useMemo(() => Object.fromEntries(departments.map(d => [d.id, d])), [departments])

  // Search filter
  const searchTokens = useMemo(() =>
    search.trim().toLowerCase().split(/\s+/).filter(Boolean), [search]
  )
  const matches = (d) => !searchTokens.length || searchTokens.every(t => d.name.toLowerCase().includes(t))
  const visibleTopLevel = topLevel.filter(d => matches(d) || unitsOf(d.id).some(matches))

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeUser = users.find(u => u.id === activeUserId)

  // ── Modal helpers ─────────────────────────────────────────────────────────

  const openCreate = (parentId = '') => {
    setEditing(null); setParentPreset(parentId)
    setForm({ name: '', parent_department_id: parentId })
    setError(''); setModalOpen(true)
  }
  const openEdit = (d) => {
    setEditing(d); setParentPreset('')
    setForm({ name: d.name, parent_department_id: d.parent_department_id || '' })
    setError(''); setModalOpen(true)
  }
  const isUnit = !!form.parent_department_id

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: form.name.trim() }
      if (form.parent_department_id) payload.parent_department_id = form.parent_department_id
      return editing ? updateDepartment(editing.id, payload) : createDepartment(payload)
    },
    onSuccess: () => { qc.invalidateQueries(['departments']); setModalOpen(false) },
    onError: (err) => setError(err.response?.data?.detail || 'Save failed.')
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteDepartment(id),
    onSuccess: () => { qc.invalidateQueries(['departments']); setDeleteTarget(null); setDeleteError('') },
    onError: (err) => setDeleteError(err.response?.data?.detail || 'Delete failed.')
  })

  const reassignMutation = useMutation({
    mutationFn: ({ userId, deptId }) => updateUser(userId, { department_id: deptId }),
    onSuccess: () => {
      qc.invalidateQueries(['users'])
      setReassignPreview(null)
    }
  })

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handleDragStart = ({ active }) => {
    setActiveUserId(active.id)
    // Auto-expand the target dept on drag start — expand all
    setExpanded(prev => {
      const next = { ...prev }
      departments.forEach(d => { next[d.id] = true })
      return next
    })
  }

  const handleDragOver = ({ over }) => {
    setOverDeptId(over?.id || null)
  }

  const handleDragEnd = ({ active, over }) => {
    setActiveUserId(null)
    setOverDeptId(null)
    if (!over || active.id === over.id) return

    const user = users.find(u => u.id === active.id)
    const targetDept = deptMap[over.id]
    if (!user || !targetDept) return
    if (user.department_id === over.id) return

    const fromDept = deptMap[user.department_id]
    setReassignPreview({ user, fromDept, toDept: targetDept })
  }

  const confirmReassign = () => {
    if (!reassignPreview) return
    reassignMutation.mutate({ userId: reassignPreview.user.id, deptId: reassignPreview.toDept.id })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Departments & Units</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {topLevel.length} departments · {departments.filter(d => d.parent_department_id).length} units ·{' '}
            {departments.reduce((s, d) => s + (d.member_count || 0), 0)} members total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden bg-muted/30">
            <button
              onClick={() => setView('chart')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
                view === 'chart' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Network size={13} /> Org Chart
            </button>
            <button
              onClick={() => setView('list')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
                view === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <List size={13} /> List
            </button>
          </div>
          <Button onClick={() => openCreate()}>
            <Plus size={14} className="mr-1.5" /> Add Department
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search departments or units…"
          className="w-full pl-9 pr-8 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === 'list' ? (
        /* ── List view ── */
        visibleTopLevel.length === 0 ? (
          <Card className="py-12 text-center text-muted-foreground text-sm">
            {search ? 'No departments match your search.' : 'No departments yet.'}
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {visibleTopLevel.map(dept => {
                  const deptUnits = unitsOf(dept.id).filter(u => !searchTokens.length || matches(u) || matches(dept))
                  return (
                    <div key={dept.id}>
                      <DeptRow
                        dept={dept} isUnit={false}
                        onEdit={() => openEdit(dept)}
                        onDelete={() => { setDeleteTarget(dept); setDeleteError('') }}
                        onAddUnit={() => openCreate(dept.id)}
                      />
                      {deptUnits.map(unit => (
                        <DeptRow
                          key={unit.id} dept={unit} isUnit={true}
                          onEdit={() => openEdit(unit)}
                          onDelete={() => { setDeleteTarget(unit); setDeleteError('') }}
                        />
                      ))}
                      {deptUnits.length === 0 && !search && (
                        <div className="pl-10 pr-4 py-2 ml-6 border-l-2 border-border/50">
                          <button
                            onClick={() => openCreate(dept.id)}
                            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                          >
                            <Plus size={11} /> Add first unit to {dept.name}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      ) : (
        /* ── Org Chart view ── */
        <div>
          <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border border-border/50">
            <GripVertical size={12} />
            Drag users between departments to reassign them. Changes require confirmation.
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-6">
              {visibleTopLevel.map(dept => {
                const deptUnits = unitsOf(dept.id).filter(u => !searchTokens.length || matches(u) || matches(dept))
                const deptUsers = usersInDept(dept.id)
                const isExpanded = expanded[dept.id] !== false // default true

                return (
                  <div key={dept.id} className="space-y-2">
                    {/* Top-level dept */}
                    <DroppableCard
                      dept={dept}
                      users={deptUsers}
                      isUnit={false}
                      expanded={isExpanded}
                      onToggle={() => setExpanded(p => ({ ...p, [dept.id]: !isExpanded }))}
                      onEdit={() => openEdit(dept)}
                      onDelete={() => { setDeleteTarget(dept); setDeleteError('') }}
                      onAddUnit={() => openCreate(dept.id)}
                      isOver={overDeptId === dept.id}
                    />

                    {/* Units grid */}
                    {deptUnits.length > 0 && (
                      <div className="ml-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {deptUnits.map(unit => {
                          const unitUsers = usersInDept(unit.id)
                          const unitExpanded = expanded[unit.id] !== false
                          return (
                            <DroppableCard
                              key={unit.id}
                              dept={unit}
                              users={unitUsers}
                              isUnit={true}
                              expanded={unitExpanded}
                              onToggle={() => setExpanded(p => ({ ...p, [unit.id]: !unitExpanded }))}
                              onEdit={() => openEdit(unit)}
                              onDelete={() => { setDeleteTarget(unit); setDeleteError('') }}
                              isOver={overDeptId === unit.id}
                            />
                          )
                        })}
                        {deptUnits.length === 0 && !search && (
                          <button
                            onClick={() => openCreate(dept.id)}
                            className="border-2 border-dashed border-border/50 rounded-xl p-4 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Plus size={12} /> Add unit to {dept.name}
                          </button>
                        )}
                      </div>
                    )}
                    {deptUnits.length === 0 && !search && (
                      <div className="ml-8">
                        <button
                          onClick={() => openCreate(dept.id)}
                          className="border-2 border-dashed border-border/50 rounded-xl px-4 py-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center gap-1.5"
                        >
                          <Plus size={12} /> Add first unit to {dept.name}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {visibleTopLevel.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  {search ? 'No departments match your search.' : 'No departments yet.'}
                </div>
              )}
            </div>

            <DragOverlay>
              {activeUser && <UserOverlayCard user={activeUser} />}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Create / Edit Department Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `Edit ${editing.parent_department_id ? 'Unit' : 'Department'}`
                : (isUnit ? 'Add Unit' : 'Add Department')
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                {isUnit ? 'Unit' : 'Department'} Name <span className="text-destructive">*</span>
              </label>
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder={isUnit ? 'e.g. Access Network' : 'e.g. Technical'}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Parent Department</label>
              <select
                value={form.parent_department_id}
                onChange={e => setForm(p => ({ ...p, parent_department_id: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— None (top-level department) —</option>
                {topLevel.filter(d => d.id !== editing?.id).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            {isUnit && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                This will be created as a unit under <strong>
                  {topLevel.find(d => d.id === form.parent_department_id)?.name}
                </strong>.
              </p>
            )}
            {error && <Alert variant="destructive"><span>{error}</span></Alert>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : (isUnit ? 'Create Unit' : 'Create Department')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => { setDeleteTarget(null); setDeleteError('') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.parent_department_id ? 'Unit' : 'Department'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm text-foreground space-y-1">
                <p>Delete <strong>"{deleteTarget?.name}"</strong>?</p>
                {!deleteTarget?.parent_department_id && unitsOf(deleteTarget?.id || '').length > 0 && (
                  <p className="text-amber-600 text-xs">
                    Warning: this department has {unitsOf(deleteTarget?.id || '').length} unit(s). Delete or reassign them first.
                  </p>
                )}
                {deleteTarget?.member_count > 0 && (
                  <p className="text-destructive text-xs">
                    {deleteTarget.member_count} user(s) are assigned here — reassign them before deleting.
                  </p>
                )}
              </div>
            </div>
            {deleteError && <Alert variant="destructive"><span>{deleteError}</span></Alert>}
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

      {/* Reassign confirmation */}
      <Dialog open={!!reassignPreview} onOpenChange={() => setReassignPreview(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reassign User</DialogTitle>
          </DialogHeader>
          {reassignPreview && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">
                  {reassignPreview.user.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{reassignPreview.user.name}</p>
                  <p className="text-xs text-muted-foreground">{reassignPreview.user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
                  {reassignPreview.fromDept?.name || 'Unassigned'}
                </span>
                <MoveRight size={14} className="text-muted-foreground flex-shrink-0" />
                <span className="text-primary font-medium bg-primary/10 px-2.5 py-1 rounded-md">
                  {reassignPreview.toDept.name}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                This will update the user's department assignment. Approval chains that rely on their manager hierarchy may be affected.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReassignPreview(null)}>Cancel</Button>
            <Button onClick={confirmReassign} loading={reassignMutation.isPending}>
              Confirm Reassignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
