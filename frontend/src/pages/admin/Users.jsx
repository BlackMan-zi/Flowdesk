import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listUsers, createUser, updateUser, deactivateUser, listRoles, listDepartments } from '../../api/users'
import Card, { CardHeader } from '../../components/ui/Card'
import Table from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Select } from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { Search, X } from 'lucide-react'

const EMPTY = { name: '', email: '', dept_top_id: '', department_id: '', manager_id: '', sn_manager_id: '', hod_id: '', role_ids: [] }

export default function AdminUsers() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers().then(r => r.data)
  })
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: () => listRoles().then(r => r.data) })
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => listDepartments().then(r => r.data) })

  // Helpers to resolve dept / unit from a department_id
  const deptMap = useMemo(() => Object.fromEntries(departments.map(d => [d.id, d])), [departments])
  const topDepts = useMemo(() =>
    departments.filter(d => !d.parent_department_id).sort((a, b) => a.name.localeCompare(b.name)),
    [departments]
  )
  const unitsOf = (topId) =>
    departments.filter(d => d.parent_department_id === topId).sort((a, b) => a.name.localeCompare(b.name))

  // Given a user's department_id, return { topDept, unit }
  const resolveUserDept = (deptId) => {
    if (!deptId) return { topDept: null, unit: null }
    const dept = deptMap[deptId]
    if (!dept) return { topDept: null, unit: null }
    if (dept.parent_department_id) {
      return { topDept: deptMap[dept.parent_department_id] || null, unit: dept }
    }
    return { topDept: dept, unit: null }
  }

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(''); setModalOpen(true) }
  const openEdit = (u) => {
    setEditing(u)
    const { topDept, unit } = resolveUserDept(u.department_id)
    setForm({
      name: u.name,
      email: u.email,
      dept_top_id: topDept?.id || '',
      department_id: u.department_id || '',
      manager_id: u.manager_id || '',
      sn_manager_id: u.sn_manager_id || '',
      hod_id: u.hod_id || '',
      role_ids: u.roles?.map(r => r.id) || []
    })
    setError('')
    setModalOpen(true)
  }

  const handleDeptTopChange = (e) => {
    const topId = e.target.value
    // When top dept changes, reset unit — department_id becomes the top dept itself
    setForm(p => ({ ...p, dept_top_id: topId, department_id: topId }))
  }

  const handleUnitChange = (e) => {
    const unitId = e.target.value
    // If a unit is chosen use it, otherwise fall back to top dept
    setForm(p => ({ ...p, department_id: unitId || p.dept_top_id }))
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...form }
      delete payload.dept_top_id   // internal UI only
      // Send null for empty optional fields so the backend clears them on edit
      payload.department_id = payload.department_id || null
      payload.manager_id    = payload.manager_id    || null
      payload.sn_manager_id = payload.sn_manager_id || null
      payload.hod_id        = payload.hod_id        || null
      return editing ? updateUser(editing.id, payload) : createUser(payload)
    },
    onSuccess: () => { qc.invalidateQueries(['users']); setModalOpen(false) },
    onError: (err) => setError(err.response?.data?.detail || 'Save failed.')
  })

  const deactivateMutation = useMutation({
    mutationFn: (id) => deactivateUser(id),
    onSuccess: () => qc.invalidateQueries(['users'])
  })

  const toggleRole = (id) => setForm(p => ({
    ...p,
    role_ids: p.role_ids.includes(id) ? p.role_ids.filter(r => r !== id) : [...p.role_ids, id]
  }))

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean)
    return users.filter(u => {
      const { topDept, unit } = resolveUserDept(u.department_id)
      const haystack = [
        u.name,
        u.email,
        topDept?.name,
        unit?.name,
        u.status,
        ...(u.roles?.map(r => r.name) || [])
      ].filter(Boolean).join(' ').toLowerCase()
      return tokens.every(t => haystack.includes(t))
    })
  }, [users, search, deptMap])

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'roles', label: 'Roles', render: r => (
      <div className="flex flex-wrap gap-1">
        {r.roles?.length ? r.roles.map(role => <Badge key={role.id} label={role.name} />) : '—'}
      </div>
    )},
    { key: 'dept', label: 'Dept', render: r => {
      const { topDept } = resolveUserDept(r.department_id)
      return topDept?.name || '—'
    }},
    { key: 'unit', label: 'Unit', render: r => {
      const { unit } = resolveUserDept(r.department_id)
      return unit?.name || '—'
    }},
    { key: 'status', label: 'Status', render: r => <Badge label={r.status} /> },
    { key: 'actions', label: '', render: r => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
        {r.status !== 'Not Active' && (
          <Button size="sm" variant="ghost" onClick={() => deactivateMutation.mutate(r.id)}
            className="text-red-500 hover:text-red-700"
          >
            Deactivate
          </Button>
        )}
      </div>
    )}
  ]

  // The unit currently selected (for the unit dropdown value)
  const selectedUnit = useMemo(() => {
    if (!form.dept_top_id || !form.department_id) return ''
    const dept = deptMap[form.department_id]
    // If the department_id points to a unit under the chosen top dept
    if (dept?.parent_department_id === form.dept_top_id) return form.department_id
    return ''
  }, [form.dept_top_id, form.department_id, deptMap])

  const availableUnits = form.dept_top_id ? unitsOf(form.dept_top_id) : []

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Users</h1>
        <Button onClick={openCreate}>+ Add User</Button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, department, role…"
          className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>
      {search && (
        <p className="text-xs text-slate-500 -mt-2">
          {filteredUsers.length} of {users.length} users
        </p>
      )}

      <Card>
        {isLoading
          ? <div className="flex justify-center py-12"><Spinner /></div>
          : <Table columns={columns} rows={filteredUsers} emptyMessage="No users match your search." />
        }
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit User' : 'Create User'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Full Name *" value={form.name} onChange={set('name')} />
            <Input label="Email *" type="email" value={form.email} onChange={set('email')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select label="Department" value={form.dept_top_id} onChange={handleDeptTopChange}>
              <option value="">None</option>
              {topDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>

            <Select
              label="Unit"
              value={selectedUnit}
              onChange={handleUnitChange}
              disabled={!form.dept_top_id || availableUnits.length === 0}
            >
              <option value="">— No unit —</option>
              {availableUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Select label="Manager" value={form.manager_id} onChange={set('manager_id')}>
              <option value="">None</option>
              {users.filter(u => u.id !== editing?.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Select label="SN Manager" value={form.sn_manager_id} onChange={set('sn_manager_id')}>
              <option value="">None</option>
              {users.filter(u => u.id !== editing?.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Select label="HOD" value={form.hod_id} onChange={set('hod_id')}>
              <option value="">None</option>
              {users.filter(u => u.id !== editing?.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>

          {/* Roles grouped by category */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Roles & Privileges</p>

            {/* System privileges */}
            {['System'].map(cat => {
              const catRoles = roles.filter(r => r.role_category === cat)
              if (!catRoles.length) return null
              return (
                <div key={cat}>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">System Access</p>
                  <div className="flex flex-wrap gap-2">
                    {catRoles.map(r => (
                      <label key={r.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer transition-colors ${
                        form.role_ids.includes(r.id)
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'border-slate-300 text-slate-600 hover:border-brand-400'
                      }`}>
                        <input type="checkbox" checked={form.role_ids.includes(r.id)} onChange={() => toggleRole(r.id)} className="sr-only" />
                        {r.name}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Admin = full config · Report Manager = users + reports · Standard User = submit forms only
                  </p>
                </div>
              )
            })}

            {/* Approval / functional roles */}
            {['Hierarchy', 'Functional', 'Executive'].map(cat => {
              const catRoles = roles.filter(r => r.role_category === cat)
              if (!catRoles.length) return null
              return (
                <div key={cat}>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">{cat} (Approvals)</p>
                  <div className="flex flex-wrap gap-2">
                    {catRoles.map(r => (
                      <label key={r.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer transition-colors ${
                        form.role_ids.includes(r.id)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-slate-300 text-slate-600 hover:border-indigo-400'
                      }`}>
                        <input type="checkbox" checked={form.role_ids.includes(r.id)} onChange={() => toggleRole(r.id)} className="sr-only" />
                        {r.name}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {!editing && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
              Initial password = user's email address. They will be required to change it on first login.
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : 'Create User'}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
