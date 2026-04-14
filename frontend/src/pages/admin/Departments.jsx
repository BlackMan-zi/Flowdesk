import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listDepartments, createDepartment, updateDepartment, deleteDepartment
} from '../../api/users'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Select } from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { Search, X, Pencil, Trash2, Plus, ChevronRight, Users, Building2, AlertTriangle } from 'lucide-react'

export default function AdminDepartments() {
  const qc = useQueryClient()

  const [modalOpen, setModalOpen]     = useState(false)
  const [editing, setEditing]         = useState(null)
  const [parentPreset, setParentPreset] = useState('')   // pre-fill parent when adding unit
  const [form, setForm]               = useState({ name: '', parent_department_id: '' })
  const [error, setError]             = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [search, setSearch]           = useState('')

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => listDepartments().then(r => r.data)
  })

  // Split into top-level and units
  const topLevel = useMemo(() =>
    departments.filter(d => !d.parent_department_id)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [departments]
  )
  const units = useMemo(() =>
    departments.filter(d => !!d.parent_department_id),
    [departments]
  )
  const unitsOf = (deptId) =>
    units.filter(u => u.parent_department_id === deptId)
      .sort((a, b) => a.name.localeCompare(b.name))

  // Search: filter both top-level and units
  const searchTokens = useMemo(() =>
    search.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [search]
  )
  const matches = (d) => {
    if (!searchTokens.length) return true
    const hay = d.name.toLowerCase()
    return searchTokens.every(t => hay.includes(t))
  }
  const visibleTopLevel = topLevel.filter(d =>
    matches(d) || unitsOf(d.id).some(matches)
  )

  // ── modal helpers ────────────────────────────────────────────────────────────

  const openCreate = (parentId = '') => {
    setEditing(null)
    setParentPreset(parentId)
    setForm({ name: '', parent_department_id: parentId })
    setError('')
    setModalOpen(true)
  }

  const openEdit = (d) => {
    setEditing(d)
    setParentPreset('')
    setForm({ name: d.name, parent_department_id: d.parent_department_id || '' })
    setError('')
    setModalOpen(true)
  }

  const isUnit = !!form.parent_department_id

  // ── mutations ────────────────────────────────────────────────────────────────

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

  // ── row renderer ─────────────────────────────────────────────────────────────

  const DeptRow = ({ dept, isUnit: unit }) => (
    <div className={`flex items-center justify-between py-3 group ${
      unit ? 'pl-10 pr-4 border-l-2 border-slate-100 ml-6' : 'px-5'
    } hover:bg-slate-50 transition-colors`}>
      <div className="flex items-center gap-3 min-w-0">
        {unit
          ? <ChevronRight size={13} className="text-slate-300 flex-shrink-0" />
          : <Building2 size={15} className="text-brand-500 flex-shrink-0" />
        }
        <div className="min-w-0">
          <span className={`font-medium truncate ${unit ? 'text-sm text-slate-700' : 'text-sm text-slate-900'}`}>
            {dept.name}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
          <Users size={11} />
          {dept.member_count || 0}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!unit && (
          <button
            onClick={() => openCreate(dept.id)}
            className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 px-2 py-1 rounded hover:bg-brand-50 transition-colors"
          >
            <Plus size={12} /> Add Unit
          </button>
        )}
        <button
          onClick={() => openEdit(dept)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => { setDeleteTarget(dept); setDeleteError('') }}
          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Departments & Units</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {topLevel.length} departments · {units.length} units · {departments.reduce((s, d) => s + (d.member_count || 0), 0)} members total
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus size={14} className="mr-1.5" /> Add Department
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search departments or units…"
          className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Tree */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : visibleTopLevel.length === 0 ? (
        <Card className="py-12 text-center text-slate-400 text-sm">
          {search ? 'No departments match your search.' : 'No departments yet.'}
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {visibleTopLevel.map(dept => {
              const deptUnits = unitsOf(dept.id).filter(u => !searchTokens.length || matches(u) || matches(dept))
              return (
                <div key={dept.id}>
                  <DeptRow dept={dept} isUnit={false} />
                  {deptUnits.map(unit => (
                    <DeptRow key={unit.id} dept={unit} isUnit={true} />
                  ))}
                  {deptUnits.length === 0 && !search && (
                    <div className="pl-10 pr-4 py-2 ml-6 border-l-2 border-slate-100">
                      <button
                        onClick={() => openCreate(dept.id)}
                        className="text-xs text-slate-400 hover:text-brand-600 transition-colors flex items-center gap-1"
                      >
                        <Plus size={11} /> Add first unit to {dept.name}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing
          ? `Edit ${editing.parent_department_id ? 'Unit' : 'Department'}`
          : (isUnit ? `Add Unit` : 'Add Department')
        }
      >
        <div className="space-y-4">
          <Input
            label={`${isUnit ? 'Unit' : 'Department'} Name *`}
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            autoFocus
            placeholder={isUnit ? 'e.g. Access Network' : 'e.g. Technical'}
          />

          <Select
            label="Parent Department (leave empty for top-level)"
            value={form.parent_department_id}
            onChange={e => setForm(p => ({ ...p, parent_department_id: e.target.value }))}
          >
            <option value="">— None (top-level department) —</option>
            {topLevel
              .filter(d => d.id !== editing?.id)
              .map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))
            }
          </Select>

          {isUnit && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
              This will be created as a unit under <strong>
                {topLevel.find(d => d.id === form.parent_department_id)?.name}
              </strong>.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : (isUnit ? 'Create Unit' : 'Create Department')}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError('') }}
        title={`Delete ${deleteTarget?.parent_department_id ? 'Unit' : 'Department'}`}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-700 space-y-1">
              <p>Delete <strong>"{deleteTarget?.name}"</strong>?</p>
              {!deleteTarget?.parent_department_id && unitsOf(deleteTarget?.id || '').length > 0 && (
                <p className="text-orange-600 text-xs">
                  Warning: this department has {unitsOf(deleteTarget?.id || '').length} unit(s). Delete or reassign them first.
                </p>
              )}
              {deleteTarget?.member_count > 0 && (
                <p className="text-red-600 text-xs">
                  {deleteTarget.member_count} user(s) are assigned here — reassign them before deleting.
                </p>
              )}
            </div>
          </div>

          {deleteError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
              loading={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 border-red-600 text-white"
            >
              Delete
            </Button>
            <Button variant="secondary" onClick={() => { setDeleteTarget(null); setDeleteError('') }}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
