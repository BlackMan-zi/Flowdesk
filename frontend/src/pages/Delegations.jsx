import React, { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDelegations, createDelegation, returnDelegation } from '../api/delegations'
import { listUsersDirectory, listRoles } from '../api/users'
import { useAuth } from '../context/AuthContext'
import { toast } from 'sonner'
import Card, { CardHeader } from '../components/ui/Card'
import Table from '../components/ui/Table'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select, Textarea } from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import Badge from '../components/ui/Badge'
import SearchCombobox from '../components/ui/SearchCombobox'
import { UserCheck, Plus } from 'lucide-react'

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Delegations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ delegate_user_id: '', role_id: '', start_date: '', end_date: '', reason: '' })
  const [error, setError] = useState('')

  const { data: delegations = [], isLoading } = useQuery({
    queryKey: ['delegations'],
    queryFn: () => listDelegations().then(r => r.data)
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: () => listUsersDirectory().then(r => r.data),
    enabled: modalOpen
  })

  const userItems = useMemo(
    () => users
      .filter(u => u.id !== user?.id)
      .map(u => ({ id: u.id, label: u.name, sublabel: u.email })),
    [users, user?.id]
  )

  const { data: allRoles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => listRoles().then(r => r.data),
    enabled: modalOpen
  })

  // user.roles from /auth/me is an array of name strings e.g. ['HR', 'Manager']
  const myRoleNames = new Set(user?.roles || [])
  const delegatableRoles = allRoles.filter(r =>
    myRoleNames.has(r.name) &&
    ['functional', 'executive', 'hierarchy'].includes(r.role_category)
  )

  const createMutation = useMutation({
    mutationFn: () => createDelegation({ ...form, role_id: form.role_id || null }),
    onSuccess: () => {
      qc.invalidateQueries(['delegations'])
      setModalOpen(false)
      setForm({ delegate_user_id: '', role_id: '', start_date: '', end_date: '', reason: '' })
      toast.success('Delegation created.')
    },
    onError: (err) => setError(err.response?.data?.detail || 'Failed to create delegation.')
  })

  const returnMutation = useMutation({
    mutationFn: (id) => returnDelegation(id),
    onSuccess: () => {
      qc.invalidateQueries(['delegations'])
      toast.success('Delegation returned.')
    },
    onError: () => toast.error('Failed to return delegation.')
  })

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const openModal = () => { setError(''); setModalOpen(true) }

  const columns = [
    {
      key: 'role', label: 'Delegated Role',
      render: r => r.role ? (
        <span className="font-medium">{r.role.name}</span>
      ) : <span className="text-muted-foreground text-sm">All roles</span>
    },
    {
      key: 'type', label: 'My Position',
      render: r => (
        <Badge label={r.original_approver_id === user?.id ? 'Delegator' : 'Delegate'}
          variant={r.original_approver_id === user?.id ? 'default' : 'secondary'} />
      )
    },
    {
      key: 'other', label: 'Other Party',
      render: r => r.original_approver_id === user?.id
        ? (r.delegate_user?.name || '—')
        : (r.original_approver?.name || '—')
    },
    { key: 'start_date', label: 'From',  render: r => fmt(r.start_date) },
    { key: 'end_date',   label: 'Until', render: r => fmt(r.end_date) },
    { key: 'reason',     label: 'Reason', render: r => r.reason || '—' },
    {
      key: 'actions', label: '',
      render: r => r.original_approver_id === user?.id ? (
        <Button size="sm" variant="outline" onClick={() => returnMutation.mutate(r.id)}
          disabled={returnMutation.isPending}>
          Return
        </Button>
      ) : null
    }
  ]

  return (
    <div className="max-w-7xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <UserCheck size={20} className="text-muted-foreground" />
            Delegations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your approval delegations.
          </p>
        </div>
        <Button onClick={openModal}>
          <Plus size={14} /> Delegate Approval
        </Button>
      </div>

      <Card>
        <CardHeader title="Active Delegations" />
        {isLoading
          ? <div className="flex justify-center py-12"><Spinner /></div>
          : <Table columns={columns} rows={delegations} emptyMessage="No active delegations." />
        }
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Delegation"
        subtitle="Delegate your approval responsibilities to another user for a specific period."
      >
        <div className="space-y-4">
          <Select
            label="Scope of Delegation *"
            value={form.role_id}
            onChange={set('role_id')}
          >
            <option value="">All my approval responsibilities</option>
            {delegatableRoles.length > 0 && (
              <optgroup label="Or scope to a specific role">
                {delegatableRoles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </optgroup>
            )}
          </Select>
          <p className="text-xs text-muted-foreground -mt-2">
            "All" covers every form you'd sign during this period — your functional roles and your hierarchy position (manager / SN manager / HOD).
          </p>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Delegate To *</label>
            <SearchCombobox
              items={userItems}
              selectedId={form.delegate_user_id}
              selectedLabel={userItems.find(u => u.id === form.delegate_user_id)?.label}
              onSelect={(id) => setForm(p => ({ ...p, delegate_user_id: id || '' }))}
              placeholder="Search by name or email…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Date *" type="date" value={form.start_date} onChange={set('start_date')} />
            <Input label="End Date *"   type="date" value={form.end_date}   onChange={set('end_date')} />
          </div>

          <Textarea label="Reason" value={form.reason} onChange={set('reason')} rows={2} placeholder="Optional reason for delegation" />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
              Create Delegation
            </Button>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
