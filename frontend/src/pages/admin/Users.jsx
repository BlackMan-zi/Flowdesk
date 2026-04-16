import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listUsers, createUser, updateUser, deactivateUser, listRoles, listDepartments } from '../../api/users'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Card from '../../components/ui/Card'
import Table from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Select } from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import {
  Search, X, Users, Plus, LayoutList, Network,
  ChevronDown, ChevronRight, Mail, Building2, UserCheck
} from 'lucide-react'

// ── Role level ordering ───────────────────────────────────────────────────────

const LEVEL_ORDER = ['CEO', 'Admin', 'HOD', 'SN Manager', 'Manager', 'Standard User', 'Observer']
const LEVEL_COLOR = {
  'CEO':           'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  'Admin':         'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  'HOD':           'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  'SN Manager':    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  'Manager':       'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  'Standard User': 'bg-muted text-muted-foreground',
  'Observer':      'bg-muted text-muted-foreground',
}

function primaryRole(roles = []) {
  for (const lvl of LEVEL_ORDER) {
    const r = roles.find(r => r.name === lvl)
    if (r) return r.name
  }
  return roles[0]?.name || 'User'
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const AVATAR_COLORS = [
  'bg-primary text-primary-foreground',
  'bg-indigo-500 text-white',
  'bg-teal-500 text-white',
  'bg-amber-500 text-white',
  'bg-rose-500 text-white',
  'bg-violet-500 text-white',
]
function avatarColor(name = '') {
  const code = [...name].reduce((s, c) => s + c.charCodeAt(0), 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

// ── Org Chart Tree ────────────────────────────────────────────────────────────

function UserCard({ user, depth = 0, childrenMap, deptMap, onEdit }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const children = childrenMap[user.id] || []
  const role = primaryRole(user.roles)
  const { topDept, unit } = resolveUserDept(user.department_id, deptMap)
  const deptLabel = unit?.name || topDept?.name || ''

  return (
    <div className={cn('relative', depth > 0 && 'ml-6 pl-4 border-l-2 border-border')}>
      <div
        className={cn(
          'flex items-center gap-3 py-2 px-3 rounded-lg group',
          'hover:bg-muted/50 transition-colors cursor-pointer'
        )}
        onClick={() => children.length > 0 && setExpanded(e => !e)}
      >
        {/* expand arrow */}
        <div className="w-4 flex-shrink-0">
          {children.length > 0 && (
            expanded
              ? <ChevronDown size={14} className="text-muted-foreground" />
              : <ChevronRight size={14} className="text-muted-foreground" />
          )}
        </div>

        {/* avatar */}
        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', avatarColor(user.name))}>
          {initials(user.name)}
        </div>

        {/* info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">{user.name}</span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', LEVEL_COLOR[role] || LEVEL_COLOR['Standard User'])}>
              {role}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground truncate">{user.email}</span>
            {deptLabel && (
              <span className="text-xs text-muted-foreground/60 flex items-center gap-1 flex-shrink-0">
                <Building2 size={10} />
                {deptLabel}
              </span>
            )}
          </div>
        </div>

        {/* actions */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); onEdit(user) }}>
            Edit
          </Button>
        </div>

        {children.length > 0 && (
          <span className="flex-shrink-0 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {children.length}
          </span>
        )}
      </div>

      {expanded && children.length > 0 && (
        <div className="mt-0.5 space-y-0.5">
          {children
            .sort((a, b) => LEVEL_ORDER.indexOf(primaryRole(a.roles)) - LEVEL_ORDER.indexOf(primaryRole(b.roles)))
            .map(child => (
              <UserCard
                key={child.id}
                user={child}
                depth={depth + 1}
                childrenMap={childrenMap}
                deptMap={deptMap}
                onEdit={onEdit}
              />
            ))}
        </div>
      )}
    </div>
  )
}

function OrgChartView({ users, deptMap, topDepts, onEdit }) {
  // Build manager → direct reports map
  const childrenMap = useMemo(() => {
    const map = {}
    users.forEach(u => {
      const mgr = u.manager_id
      if (mgr) {
        if (!map[mgr]) map[mgr] = []
        map[mgr].push(u)
      }
    })
    return map
  }, [users])

  // Group into departments by the root users in that dept
  const deptSections = useMemo(() => {
    const sections = []
    topDepts.forEach(dept => {
      // users directly or indirectly in this dept
      const deptUsers = users.filter(u => {
        if (!u.department_id) return false
        const d = deptMap[u.department_id]
        if (!d) return false
        return d.id === dept.id || d.parent_department_id === dept.id
      })
      if (!deptUsers.length) return

      // roots = users in this dept with no manager OR whose manager is in a different dept
      const deptUserIds = new Set(deptUsers.map(u => u.id))
      const roots = deptUsers.filter(u => {
        if (!u.manager_id) return true
        return !deptUserIds.has(u.manager_id)
      })

      sections.push({ dept, roots })
    })
    return sections
  }, [users, deptMap, topDepts])

  // Also catch users with no dept
  const unassigned = users.filter(u => !u.department_id)

  return (
    <div className="space-y-4">
      {deptSections.map(({ dept, roots }) => (
        <Card key={dept.id}>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Building2 size={15} className="text-muted-foreground" />
            <span className="font-semibold text-sm text-foreground">{dept.name}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {users.filter(u => {
                const d = deptMap[u.department_id]
                return d?.id === dept.id || d?.parent_department_id === dept.id
              }).length} people
            </span>
          </div>
          <div className="p-2 space-y-0.5">
            {roots
              .sort((a, b) => LEVEL_ORDER.indexOf(primaryRole(a.roles)) - LEVEL_ORDER.indexOf(primaryRole(b.roles)))
              .map(u => (
                <UserCard
                  key={u.id}
                  user={u}
                  depth={0}
                  childrenMap={childrenMap}
                  deptMap={deptMap}
                  onEdit={onEdit}
                />
              ))}
          </div>
        </Card>
      ))}
      {unassigned.length > 0 && (
        <Card>
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Users size={15} className="text-muted-foreground" />
            <span className="font-semibold text-sm text-foreground">Unassigned</span>
          </div>
          <div className="p-2 space-y-0.5">
            {unassigned.map(u => (
              <UserCard
                key={u.id}
                user={u}
                depth={0}
                childrenMap={childrenMap}
                deptMap={deptMap}
                onEdit={onEdit}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function resolveUserDept(deptId, deptMap) {
  if (!deptId || !deptMap) return { topDept: null, unit: null }
  const dept = deptMap[deptId]
  if (!dept) return { topDept: null, unit: null }
  if (dept.parent_department_id) {
    return { topDept: deptMap[dept.parent_department_id] || null, unit: dept }
  }
  return { topDept: dept, unit: null }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const EMPTY = {
  name: '', email: '', dept_top_id: '', department_id: '',
  manager_id: '', sn_manager_id: '', hod_id: '', role_ids: []
}

export default function AdminUsers() {
  const qc = useQueryClient()
  const [view, setView]         = useState('list')   // 'list' | 'tree'
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers().then(r => r.data)
  })
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => listRoles().then(r => r.data)
  })
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => listDepartments().then(r => r.data)
  })

  const deptMap  = useMemo(() => Object.fromEntries(departments.map(d => [d.id, d])), [departments])
  const topDepts = useMemo(() =>
    departments.filter(d => !d.parent_department_id).sort((a, b) => a.name.localeCompare(b.name)),
    [departments]
  )
  const unitsOf = (topId) =>
    departments.filter(d => d.parent_department_id === topId).sort((a, b) => a.name.localeCompare(b.name))

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const openCreate = () => { setEditing(null); setForm(EMPTY); setError(''); setModalOpen(true) }
  const openEdit = (u) => {
    setEditing(u)
    const { topDept, unit } = resolveUserDept(u.department_id, deptMap)
    setForm({
      name:          u.name,
      email:         u.email,
      dept_top_id:   topDept?.id     || '',
      department_id: u.department_id || '',
      manager_id:    u.manager_id    || '',
      sn_manager_id: u.sn_manager_id || '',
      hod_id:        u.hod_id        || '',
      role_ids:      u.roles?.map(r => r.id) || []
    })
    setError('')
    setModalOpen(true)
  }

  const handleDeptTopChange = (e) => {
    const topId = e.target.value
    setForm(p => ({ ...p, dept_top_id: topId, department_id: topId }))
  }
  const handleUnitChange = (e) => {
    const unitId = e.target.value
    setForm(p => ({ ...p, department_id: unitId || p.dept_top_id }))
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...form }
      delete payload.dept_top_id
      payload.department_id = payload.department_id || null
      payload.manager_id    = payload.manager_id    || null
      payload.sn_manager_id = payload.sn_manager_id || null
      payload.hod_id        = payload.hod_id        || null
      return editing ? updateUser(editing.id, payload) : createUser(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setModalOpen(false)
      toast.success(editing ? 'User updated.' : 'User created.')
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || 'Save failed.'
      setError(msg)
      toast.error(msg)
    }
  })

  const deactivateMutation = useMutation({
    mutationFn: (id) => deactivateUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deactivated.')
    },
    onError: () => toast.error('Failed to deactivate user.')
  })

  const toggleRole = (id) => setForm(p => ({
    ...p,
    role_ids: p.role_ids.includes(id) ? p.role_ids.filter(r => r !== id) : [...p.role_ids, id]
  }))

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean)
    return users.filter(u => {
      const { topDept, unit } = resolveUserDept(u.department_id, deptMap)
      const haystack = [
        u.name, u.email, topDept?.name, unit?.name, u.status,
        ...(u.roles?.map(r => r.name) || [])
      ].filter(Boolean).join(' ').toLowerCase()
      return tokens.every(t => haystack.includes(t))
    })
  }, [users, search, deptMap])

  const selectedUnit   = useMemo(() => {
    if (!form.dept_top_id || !form.department_id) return ''
    const dept = deptMap[form.department_id]
    if (dept?.parent_department_id === form.dept_top_id) return form.department_id
    return ''
  }, [form.dept_top_id, form.department_id, deptMap])

  const availableUnits = form.dept_top_id ? unitsOf(form.dept_top_id) : []

  // ── List view columns ─────────────────────────────────────────────────────
  const columns = [
    {
      key: 'name', label: 'Name',
      render: r => (
        <div className="flex items-center gap-2.5">
          <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', avatarColor(r.name))}>
            {initials(r.name)}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{r.name}</p>
            <p className="text-xs text-muted-foreground">{r.email}</p>
          </div>
        </div>
      )
    },
    {
      key: 'roles', label: 'Role',
      render: r => {
        const role = primaryRole(r.roles)
        return (
          <span className={cn('text-xs px-2 py-0.5 rounded font-medium', LEVEL_COLOR[role] || LEVEL_COLOR['Standard User'])}>
            {role}
          </span>
        )
      }
    },
    {
      key: 'dept', label: 'Department',
      render: r => {
        const { topDept } = resolveUserDept(r.department_id, deptMap)
        return <span className="text-sm text-foreground">{topDept?.name || '—'}</span>
      }
    },
    {
      key: 'unit', label: 'Unit',
      render: r => {
        const { unit } = resolveUserDept(r.department_id, deptMap)
        return <span className="text-sm text-muted-foreground">{unit?.name || '—'}</span>
      }
    },
    {
      key: 'status', label: 'Status',
      render: r => (
        <Badge
          label={r.status}
          className={r.status === 'Active' || r.status === 'active'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'bg-muted text-muted-foreground'
          }
        />
      )
    },
    {
      key: 'actions', label: '',
      render: r => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
          {r.status !== 'Not Active' && r.status !== 'not_active' && (
            <Button size="sm" variant="ghost"
              className="text-destructive hover:text-destructive/80"
              onClick={() => deactivateMutation.mutate(r.id)}
            >
              Deactivate
            </Button>
          )}
        </div>
      )
    }
  ]

  return (
    <div className="max-w-6xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users size={20} className="text-muted-foreground" />
            Users
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {users.length} user{users.length !== 1 ? 's' : ''} in this organisation
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
                view === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <LayoutList size={14} /> List
            </button>
            <button
              onClick={() => setView('tree')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
                view === 'tree'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <Network size={14} /> Org Chart
            </button>
          </div>
          <Button onClick={openCreate}>
            <Plus size={14} /> Add User
          </Button>
        </div>
      </div>

      {/* Search (both views) */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, department, role…"
            className="w-full pl-9 pr-8 h-9 border border-input rounded-md text-sm bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        {search && (
          <p className="text-sm text-muted-foreground">
            {filteredUsers.length} of {users.length}
          </p>
        )}
      </div>

      {/* Views */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : view === 'list' ? (
        <Card>
          <Table columns={columns} rows={filteredUsers} emptyMessage="No users match your search." />
        </Card>
      ) : (
        <OrgChartView
          users={search ? filteredUsers : users}
          deptMap={deptMap}
          topDepts={topDepts}
          onEdit={openEdit}
        />
      )}

      {/* Edit / Create Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit — ${editing.name}` : 'Add User'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Full Name *" value={form.name}  onChange={set('name')} />
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

          {/* Roles */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <UserCheck size={15} className="text-muted-foreground" />
              Roles &amp; Privileges
            </p>

            {['System'].map(cat => {
              const catRoles = roles.filter(r => r.role_category === cat)
              if (!catRoles.length) return null
              return (
                <div key={cat}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">System Access</p>
                  <div className="flex flex-wrap gap-2">
                    {catRoles.map(r => (
                      <label key={r.id} className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer transition-colors select-none',
                        form.role_ids.includes(r.id)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-foreground hover:border-primary/60 hover:bg-primary/5'
                      )}>
                        <input type="checkbox" checked={form.role_ids.includes(r.id)} onChange={() => toggleRole(r.id)} className="sr-only" />
                        {r.name}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Admin = full access · Standard User = submit forms only
                  </p>
                </div>
              )
            })}

            {['Hierarchy', 'Functional', 'Executive'].map(cat => {
              const catRoles = roles.filter(r => r.role_category === cat)
              if (!catRoles.length) return null
              return (
                <div key={cat}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{cat} (Approvals)</p>
                  <div className="flex flex-wrap gap-2">
                    {catRoles.map(r => (
                      <label key={r.id} className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer transition-colors select-none',
                        form.role_ids.includes(r.id)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-border text-foreground hover:border-indigo-400/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                      )}>
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
            <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-xs text-primary">
              Initial password = user's email address. They will be prompted to change it on first login.
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : 'Create User'}
            </Button>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
