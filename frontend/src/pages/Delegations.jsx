import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDelegations, createDelegation, returnDelegation } from '../api/delegations'
import { listUsers } from '../api/users'
import { useAuth } from '../context/AuthContext'
import Card, { CardHeader } from '../components/ui/Card'
import Table from '../components/ui/Table'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select, Textarea } from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'

export default function Delegations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ delegate_user_id: '', start_date: '', end_date: '', reason: '' })
  const [error, setError] = useState('')

  const { data: delegations = [], isLoading } = useQuery({
    queryKey: ['delegations'],
    queryFn: () => listDelegations().then(r => r.data)
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers().then(r => r.data),
    enabled: modalOpen
  })

  const createMutation = useMutation({
    mutationFn: () => createDelegation(form),
    onSuccess: () => { qc.invalidateQueries(['delegations']); setModalOpen(false); setForm({ delegate_user_id: '', start_date: '', end_date: '', reason: '' }) },
    onError: (err) => setError(err.response?.data?.detail || 'Failed to create delegation.')
  })

  const returnMutation = useMutation({
    mutationFn: (id) => returnDelegation(id),
    onSuccess: () => qc.invalidateQueries(['delegations'])
  })

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const columns = [
    { key: 'type', label: 'Role', render: r => r.original_approver_id === user?.id ? 'Delegator' : 'Delegate' },
    { key: 'other', label: 'Other Party', render: r =>
      r.original_approver_id === user?.id
        ? (r.delegate_user?.name || '—')
        : (r.original_approver?.name || '—')
    },
    { key: 'start_date', label: 'From', render: r => r.start_date },
    { key: 'end_date', label: 'Until', render: r => r.end_date },
    { key: 'reason', label: 'Reason', render: r => r.reason || '—' },
    { key: 'actions', label: '', render: r =>
      r.original_approver_id === user?.id ? (
        <Button size="sm" variant="secondary" onClick={() => returnMutation.mutate(r.id)}>
          Return
        </Button>
      ) : null
    }
  ]

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Delegations</h1>
        <Button onClick={() => setModalOpen(true)}>+ Delegate Approval</Button>
      </div>

      <Card>
        <CardHeader title="Active Delegations" />
        {isLoading
          ? <div className="flex justify-center py-12"><Spinner /></div>
          : <Table columns={columns} rows={delegations} emptyMessage="No active delegations." />
        }
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Delegation">
        <div className="space-y-4">
          <Select
            label="Delegate To *"
            value={form.delegate_user_id}
            onChange={set('delegate_user_id')}
          >
            <option value="">Select user…</option>
            {users.filter(u => u.id !== user?.id).map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Date *" type="date" value={form.start_date} onChange={set('start_date')} />
            <Input label="End Date *" type="date" value={form.end_date} onChange={set('end_date')} />
          </div>
          <Textarea label="Reason" value={form.reason} onChange={set('reason')} rows={2} />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
              Create Delegation
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
