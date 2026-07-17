import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listUsers, createUser, updateUser, deactivateUser, reactivateUser, deleteUserPermanently, listRoles, createRole, updateRole, deleteRole, listDepartments,
  setMfaRequired, resetUserMfa
} from '../../api/users'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '../../context/AuthContext'
import Card from '../../components/ui/Card'
import Table from '../../components/ui/Table'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal, { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/Modal'
import Input, { Select } from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs'
import {
  Search, X, Users, Plus, LayoutList, Network,
  ChevronDown, ChevronRight, Mail, Building2, UserCheck, ShieldCheck, ShieldAlert, Trash2, Pencil, Check
} from 'lucide-react'

function MfaSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0',
        checked ? 'bg-primary' : 'bg-input',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span className={cn(
        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0.5'
      )} />
    </button>
  )
}

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
  const { user: currentUser } = useAuth()
  const [view, setView]         = useState('list')   // 'list' | 'tree'
  const [activeUserTab, setActiveUserTab] = useState('active')   // 'active' | 'deactivated'
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleCategory, setNewRoleCategory] = useState('Functional')
  const [rolesExpanded, setRolesExpanded] = useState(false)
  const [editingRoleId, setEditingRoleId] = useState(null)
  const [editingRoleName, setEditingRoleName] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers().then(r => r.data)
  })
  // Deactivated users stay visible in the main table (below) but shouldn't
  // be pickable as a manager/HOD or appear in the org chart.
  const activeUsers = useMemo(
    () => users.filter(u => u.status !== 'Not Active' && u.status !== 'not_active'),
    [users]
  )
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
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['users'] })
      setModalOpen(false)
      toast.success(editing ? 'User updated.' : 'User created.')
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || 'Save failed.'
      setError(msg)
      toast.error(msg)
    }
  })

  const createRoleMutation = useMutation({
    mutationFn: () => createRole({ name: newRoleName.trim(), role_category: newRoleCategory }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      setNewRoleName('')
      toast.success(`Role "${newRoleName.trim()}" created.`)
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to create role.')
  })

  const deleteRoleMutation = useMutation({
    mutationFn: (id) => deleteRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      toast.success('Role deleted.')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Cannot delete this role.')
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, name }) => updateRole(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      setEditingRoleId(null)
      setEditingRoleName('')
      toast.success('Role renamed.')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to rename role.')
  })

  const deactivateMutation = useMutation({
    mutationFn: (id) => deactivateUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deactivated.')
    },
    onError: () => toast.error('Failed to deactivate user.')
  })

  const reactivateMutation = useMutation({
    mutationFn: (id) => reactivateUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User reactivated.')
    },
    onError: () => toast.error('Failed to reactivate user.')
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteUserPermanently(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User permanently deleted.')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to delete user.')
  })

  const mfaRequiredMutation = useMutation({
    mutationFn: ({ id, required }) => setMfaRequired(id, required),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: () => toast.error('Failed to update MFA requirement.')
  })

  const resetMfaMutation = useMutation({
    mutationFn: (id) => resetUserMfa(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('MFA reset. They\'ll re-enroll at next login.')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Failed to reset MFA.')
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

  const isDeactivated = (u) => u.status === 'Not Active' || u.status === 'not_active'
  const activeTabUsers = useMemo(() => filteredUsers.filter(u => !isDeactivated(u)), [filteredUsers])
  const deactivatedTabUsers = useMemo(() => filteredUsers.filter(isDeactivated), [filteredUsers])

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
      key: 'mfa', label: 'MFA',
      render: r => (
        <div className="flex items-center gap-2">
          <MfaSwitch
            checked={!!r.mfa_required}
            disabled={mfaRequiredMutation.isPending}
            onChange={(next) => mfaRequiredMutation.mutate({ id: r.id, required: next })}
          />
          {r.mfa_required && (
            r.mfa_enabled
              ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><ShieldCheck size={12} /> Enrolled</span>
              : <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><ShieldAlert size={12} /> Pending</span>
          )}
        </div>
      )
    },
    {
      key: 'actions', label: '',
      render: r => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
          {r.mfa_enabled && r.id !== currentUser?.id && (
            <Button size="sm" variant="ghost"
              onClick={() => {
                if (window.confirm(`Reset MFA for ${r.name}? They'll be asked to re-enroll (fresh QR code) at their next login.`))
                  resetMfaMutation.mutate(r.id)
              }}
            >
              Reset MFA
            </Button>
          )}
          {r.status !== 'Not Active' && r.status !== 'not_active' ? (
            <Button size="sm" variant="ghost"
              className="text-destructive hover:text-destructive/80"
              onClick={() => deactivateMutation.mutate(r.id)}
            >
              Deactivate
            </Button>
          ) : (
            <Button size="sm" variant="ghost"
              loading={reactivateMutation.isPending}
              onClick={() => reactivateMutation.mutate(r.id)}
            >
              Reactivate
            </Button>
          )}
          {r.id !== currentUser?.id && (
            <Button size="sm" variant="ghost"
              className="text-destructive hover:text-destructive/80"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm(
                  `Permanently delete ${r.name}? This cannot be undone. Only works if they have no submitted forms, approvals, or other history — otherwise deactivate them instead.`
                )) {
                  deleteMutation.mutate(r.id)
                }
              }}
            >
              Delete
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

      {/* Approval Roles management */}
      <Card>
        <button
          onClick={() => setRolesExpanded(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-muted-foreground" />
            Approval Roles
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {roles.filter(r => r.role_category === 'Functional' || r.role_category === 'Executive').length}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">{rolesExpanded ? 'Collapse ▲' : 'Expand ▼'}</span>
        </button>

        {rolesExpanded && (
          <div className="border-t border-border px-5 py-4 space-y-5">

            {/* Functional and Executive roles grouped */}
            {['Functional', 'Executive'].map(cat => {
              const catRoles = roles.filter(r => r.role_category === cat)
              return (
                <div key={cat}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cat}</p>
                  {catRoles.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No {cat.toLowerCase()} roles yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {catRoles.map(r => {
                        const holders = users.filter(u => u.roles?.some(ur => ur.id === r.id))
                        return (
                          <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-sm">
                            {editingRoleId === r.id ? (
                              <>
                                <input
                                  autoFocus
                                  value={editingRoleName}
                                  onChange={e => setEditingRoleName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && editingRoleName.trim())
                                      updateRoleMutation.mutate({ id: r.id, name: editingRoleName.trim() })
                                    if (e.key === 'Escape') { setEditingRoleId(null); setEditingRoleName('') }
                                  }}
                                  className="w-32 h-6 px-1.5 border border-ring rounded text-sm bg-background text-foreground focus:outline-none"
                                />
                                <button
                                  onClick={() => editingRoleName.trim() && updateRoleMutation.mutate({ id: r.id, name: editingRoleName.trim() })}
                                  disabled={!editingRoleName.trim()}
                                  className="text-primary hover:text-primary/80 transition-colors"
                                  title="Save"
                                >
                                  <Check size={13} />
                                </button>
                                <button
                                  onClick={() => { setEditingRoleId(null); setEditingRoleName('') }}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  title="Cancel"
                                >
                                  <X size={13} />
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="font-medium text-foreground">{r.name}</span>
                                {holders.length > 0 ? (
                                  <span className="text-xs text-muted-foreground">
                                    → {holders.map(h => h.name.split(' ')[0]).join(', ')}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground/50 italic">unassigned</span>
                                )}
                                <button
                                  onClick={() => { setEditingRoleId(r.id); setEditingRoleName(r.name) }}
                                  title="Rename role"
                                  className="ml-1 text-muted-foreground hover:text-primary transition-colors"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Delete the "${r.name}" role? This cannot be undone.`))
                                      deleteRoleMutation.mutate(r.id)
                                  }}
                                  title="Delete role"
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Create new role */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newRoleName.trim() && createRoleMutation.mutate()}
                placeholder="New role name e.g. Legal, Compliance Officer…"
                className="flex-1 h-9 px-3 border border-input rounded-md text-sm bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <select
                value={newRoleCategory}
                onChange={e => setNewRoleCategory(e.target.value)}
                className="h-9 px-2 border border-input rounded-md text-sm bg-background text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="Functional">Functional</option>
                <option value="Executive">Executive</option>
              </select>
              <Button
                size="sm"
                onClick={() => createRoleMutation.mutate()}
                disabled={!newRoleName.trim()}
                loading={createRoleMutation.isPending}
              >
                <Plus size={13} /> Add Role
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Create any approval role here, then assign it to a user via Edit. Roles appear automatically in the approval workflow builder.
            </p>
          </div>
        )}
      </Card>

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
        <Tabs value={activeUserTab} onValueChange={setActiveUserTab}>
          <TabsList>
            <TabsTrigger value="active">Active ({activeTabUsers.length})</TabsTrigger>
            <TabsTrigger value="deactivated">Deactivated ({deactivatedTabUsers.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">
            <Card>
              <Table columns={columns} rows={activeTabUsers} emptyMessage="No users match your search." />
            </Card>
          </TabsContent>
          <TabsContent value="deactivated" className="mt-4">
            <Card>
              <Table columns={columns} rows={deactivatedTabUsers} emptyMessage="No deactivated users." />
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <OrgChartView
          users={(search ? filteredUsers : users).filter(u => u.status !== 'Not Active' && u.status !== 'not_active')}
          deptMap={deptMap}
          topDepts={topDepts}
          onEdit={openEdit}
        />
      )}

      {/* Edit / Create Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit: ${editing.name}` : 'Add User'}
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
              <option value="">No unit</option>
              {availableUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Select label="Manager" value={form.manager_id} onChange={set('manager_id')}>
              <option value="">None</option>
              {activeUsers.filter(u => u.id !== editing?.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Select label="SN Manager" value={form.sn_manager_id} onChange={set('sn_manager_id')}>
              <option value="">None</option>
              {activeUsers.filter(u => u.id !== editing?.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Select label="HOD" value={form.hod_id} onChange={set('hod_id')}>
              <option value="">None</option>
              {activeUsers.filter(u => u.id !== editing?.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
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
