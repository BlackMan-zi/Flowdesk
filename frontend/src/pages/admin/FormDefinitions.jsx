import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  listFormDefinitions, createFormDefinition, updateFormDefinition, deleteFormDefinition
} from '../../api/forms'
import { listApprovalTemplates } from '../../api/forms'
import Card from '../../components/ui/Card'
import Table from '../../components/ui/Table'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import Badge from '../../components/ui/Badge'
import { Plus, LayoutTemplate, Settings, Search, X, Trash2, AlertTriangle } from 'lucide-react'

const EMPTY_FORM = {
  name: '', description: '', code_suffix: '',
  visibility: 'all_users', allow_backdating: false, allow_attachments: true,
  approval_template_id: '', fields: []
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

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
  const setBool = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.checked }))

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setError(''); setModalOpen(true) }
  const openEdit = (d) => {
    setEditing(d)
    setForm({
      name: d.name, description: d.description || '',
      code_suffix: d.code_suffix, visibility: d.visibility,
      allow_backdating: d.allow_backdating, allow_attachments: d.allow_attachments,
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
        fields: form.fields.map((f, idx) => ({
          ...f,
          display_order: idx,
          options: f.options ? (typeof f.options === 'string' ? f.options.split(',').map(s => s.trim()) : f.options) : null
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
      const hay = [
        d.name, d.description, d.code_suffix,
        d.approval_template?.name,
        d.visibility
      ].filter(Boolean).join(' ').toLowerCase()
      return tokens.every(t => hay.includes(t))
    })
  }, [defs, search])

  const columns = [
    { key: 'name', label: 'Form Name' },
    { key: 'code_suffix', label: 'Code', render: r => <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{r.code_suffix}</span> },
    { key: 'fields', label: 'Fields', render: r => r.fields?.filter(f => f.is_active !== false).length || 0 },
    { key: 'pdf', label: 'Template', render: r => r.pdf_template_path
        ? <Badge label="PDF Layout" />
        : <span className="text-slate-400 text-xs">No PDF</span>
    },
    { key: 'approval', label: 'Approval', render: r => r.approval_template?.name || <span className="text-slate-400 text-xs">None</span> },
    { key: 'actions', label: '', render: r => (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/form-definitions/${r.id}/builder`)}>
          <LayoutTemplate size={12} className="mr-1" /> Design Layout
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
          <Settings size={12} />
        </Button>
        <Button
          size="sm" variant="ghost"
          onClick={() => { setDeleteTarget(r); setDeleteError('') }}
          className="text-red-500 hover:text-red-700"
        >
          <Trash2 size={12} />
        </Button>
      </div>
    )}
  ]

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Form Definitions</h1>
        <Button onClick={openCreate}>+ New Form Type</Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, code, approval template…"
          className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>
      {search && <p className="text-xs text-slate-500 -mt-2">{filtered.length} of {defs.length} forms</p>}

      <Card>
        {isLoading
          ? <div className="flex justify-center py-12"><Spinner /></div>
          : <Table columns={columns} rows={filtered} emptyMessage="No form definitions yet." />
        }
      </Card>

      {/* Create / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Form Definition' : 'Create Form Definition'} size="xl">
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Input label="Form Name *" className="col-span-2" value={form.name} onChange={set('name')} />
            <Input label="Code Suffix *" value={form.code_suffix} onChange={set('code_suffix')} placeholder="e.g. LRQ" />
          </div>
          <Textarea label="Description" value={form.description} onChange={set('description')} rows={2} />

          <div className="grid grid-cols-2 gap-3">
            <Select label="Approval Template" value={form.approval_template_id} onChange={set('approval_template_id')}>
              <option value="">None</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Select label="Visibility" value={form.visibility} onChange={set('visibility')}>
              <option value="all_users">All Users</option>
              <option value="specific_departments">Specific Departments</option>
            </Select>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={form.allow_attachments} onChange={setBool('allow_attachments')} className="rounded" />
              Allow attachments
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={form.allow_backdating} onChange={setBool('allow_backdating')} className="rounded" />
              Allow backdating
            </label>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
            Fields and PDF layout are managed in the <strong>Design Layout</strong> editor after saving the form settings.
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {editing ? 'Save Changes' : 'Create Form'}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError('') }}
        title="Delete Form Definition"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-700 space-y-1">
              <p>Delete <strong>"{deleteTarget?.name}"</strong>?</p>
              <p className="text-slate-500 text-xs">This cannot be undone. Any forms currently under review will be cancelled.</p>
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
            <Button variant="secondary" onClick={() => { setDeleteTarget(null); setDeleteError('') }}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
