import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listAllDelegations, adminCreateDelegation, returnDelegation } from '../../api/delegations'
import { listUsers } from '../../api/users'
import Card from '../../components/ui/Card'
import Table from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { Search, X, Plus, AlertTriangle, RotateCcw } from 'lucide-react'

const EMPTY = { original_approver_id: '', delegate_user_id: '', start_date: '', end_date: '', reason: '' }

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminDelegations() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [returnTarget, setReturnTarget] = useState(null)
  const [returnError, setReturnError] = useState('')

  const { data: delegations = [], isLoading } = useQuery({
    queryKey: ['delegations', 'all'],
    queryFn: () => listAllDelegations().then(r => r.data)
  })
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers().then(r => r.data),
    enabled: modalOpen
  })

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const openCreate = () => { setForm(EMPTY); setError(''); setModalOpen(true) }

  const createMutation = useMutation({
    mutationFn: () => adminCreateDelegation({
      ...form,
      reason: form.reason || null
    }),
    onSuccess: () => { qc.invalidateQueries(['delegations', 'all']); setModalOpen(false) },
    onError: (err) => setError(err.response?.data?.detail || 'Create failed.')
  })

  const returnMutation = useMutation({
    mutationFn: (id) => returnDelegation(id),
    onSuccess: () => { qc.invalidateQueries(['delegations', 'all']); setReturnTarget(null); setReturnError('') },
    onError: (err) => setReturnError(err.response?.data?.detail || 'Failed to return delegation.')
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return delegations
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean)
    return delegations.filter(d => {
      const hay = [
        d.original_approver?.name,
        d.original_approver?.email,
        d.delegate_user?.name,
        d.delegate_user?.email,
        d.reason,
        d.is_active ? 'active' : 'returned'
      ].filter(Boolean).join(' ').toLowerCase()
      return tokens.every(t => hay.includes(t))
    })
  }, [delegations, search])

  const activeCount = delegations.filter(d => d.is_active).length

  const columns = [
    { key: 'original', label: 'Original Approver', render: r => (
      <div>
        <p className="text-sm font-medium text-slate-800">{r.original_approver?.name || '—'}</p>
        <p className="text-xs text-slate-400">{r.original_approver?.email}</p>
      </div>
    )},
    { key: 'delegate', label: 'Delegated To', render: r => (
      <div>
        <p className="text-sm font-medium text-slate-800">{r.delegate_user?.name || '—'}</p>
        <p className="text-xs text-slate-400">{r.delegate_user?.email}</p>
      </div>
    )},
    { key: 'period', label: 'Period', render: r => (
      <span className="text-sm text-slate-600">{fmt(r.start_date)} → {fmt(r.end_date)}</span>
    )},
    { key: 'reason', label: 'Reason', render: r => (
      <span className="text-sm text-slate-500 truncate max-w-xs block">{r.reason || '—'}</span>
    )},
    { key: 'status', label: 'Status', render: r => (
      <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
        r.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
      }`}>
        {r.is_active ? 'Active' : 'Returned'}
      </span>
    )},
    { key: 'returned_at', label: 'Returned On', render: r => fmt(r.returned_at) },
    { key: 'actions', label: '', render: r => r.is_active ? (
      <Button
        size="sm" variant="ghost"
        onClick={() => { setReturnTarget(r); setReturnError('') }}
        className="text-orange-500 hover:text-orange-700"
      >
        <RotateCcw size={13} className="mr-1" /> Return
      </Button>
    ) : null }
  ]

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">All Delegations</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {delegations.length} total · {activeCount} active
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={14} className="mr-1.5" /> New Delegation
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, reason…"
          className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>
      {search && <p className="text-xs text-slate-500 -mt-2">{filtered.length} of {delegations.length} delegations</p>}

      <Card>
        {isLoading
          ? <div className="flex justify-center py-12"><Spinner /></div>
          : <Table columns={columns} rows={filtered} emptyMessage="No delegations found." />
        }
      </Card>

      {/* Create Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Delegation"
        size="md"
      >
        <div className="space-y-4">
          <Select label="Original Approver *" value={form.original_approver_id} onChange={set('original_approver_id')}>
            <option value="">Select approver…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </Select>

          <Select label="Delegate To *" value={form.delegate_user_id} onChange={set('delegate_user_id')}>
            <option value="">Select delegate…</option>
            {users
              .filter(u => u.id !== form.original_approver_id)
              .map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Date *" type="date" value={form.start_date} onChange={set('start_date')} />
            <Input label="End Date *" type="date" value={form.end_date} onChange={set('end_date')} />
          </div>

          <Textarea label="Reason" value={form.reason} onChange={set('reason')} rows={2} placeholder="Optional reason for delegation" />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
              Create Delegation
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Return confirmation */}
      <Modal
        open={!!returnTarget}
        onClose={() => { setReturnTarget(null); setReturnError('') }}
        title="Return Delegation"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-700 space-y-1">
              <p>Return the delegation from <strong>{returnTarget?.original_approver?.name}</strong> to <strong>{returnTarget?.delegate_user?.name}</strong>?</p>
              <p className="text-xs text-slate-500">The original approver will immediately regain their approval rights.</p>
            </div>
          </div>
          {returnError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{returnError}</p>
          )}
          <div className="flex gap-3">
            <Button
              onClick={() => returnMutation.mutate(returnTarget.id)}
              loading={returnMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700 border-orange-600 text-white"
            >
              Return Delegation
            </Button>
            <Button variant="secondary" onClick={() => { setReturnTarget(null); setReturnError('') }}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
