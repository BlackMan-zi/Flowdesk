import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  getFormDefinition, replaceFormFields, createApprovalTemplate, updateApprovalTemplate,
  updateFormDefinition,
} from '../../api/forms'
import { listUsers, listRoles } from '../../api/users'
import { getMyOrganization } from '../../api/settings'
import { Card, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Alert } from '../../components/ui/alert'
import { cn } from '../../lib/utils'
import {
  ArrowLeft, Save, Plus, Trash2, ChevronUp, ChevronDown, GripVertical,
  Type, AlignLeft, Hash, DollarSign, Calendar, ChevronDown as ChevronDownIcon,
  CheckSquare, Circle, Calculator, Paperclip, PenLine, Hash as HashIcon,
  Table as TableIcon, FolderOpen, Settings as SettingsIcon, Eye, Pencil,
  Workflow, ShieldCheck,
} from 'lucide-react'
import ApprovalEditor, { stepsToApiPayload, stepsFromApi } from '../../components/forms/ApprovalEditor'
import InitiatorRolesPanel from '../../components/forms/InitiatorRolesPanel'
import LetterheadPage from '../../components/letterhead/LetterheadPage'
import {
  fetchHeaderImageObjectUrl, fetchFooterImageObjectUrl,
} from '../../api/settings'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/Modal'

// ── Field type catalogue ──────────────────────────────────────────────────────

const FIELD_TYPES = [
  { value: 'text',       label: 'Short Text',  icon: Type,           group: 'Input' },
  { value: 'textarea',   label: 'Paragraph',   icon: AlignLeft,      group: 'Input' },
  { value: 'number',     label: 'Number',      icon: Hash,           group: 'Input' },
  { value: 'currency',   label: 'Currency',    icon: DollarSign,     group: 'Input' },
  { value: 'date',       label: 'Date',        icon: Calendar,       group: 'Input' },
  { value: 'dropdown',   label: 'Dropdown',    icon: ChevronDownIcon,group: 'Selection' },
  { value: 'radio',      label: 'Radio',       icon: Circle,         group: 'Selection' },
  { value: 'checkbox',   label: 'Checkbox',    icon: CheckSquare,    group: 'Selection' },
  { value: 'table',      label: 'Table',       icon: TableIcon,      group: 'Advanced' },
  { value: 'calculated', label: 'Calculated',  icon: Calculator,     group: 'Advanced' },
  { value: 'reference',  label: 'Reference No',icon: HashIcon,       group: 'Advanced' },
  { value: 'file',       label: 'Attachment',  icon: Paperclip,      group: 'Advanced' },
  { value: 'signature',  label: 'Signature',   icon: PenLine,        group: 'Advanced' },
]

const FT = Object.fromEntries(FIELD_TYPES.map(t => [t.value, t]))

const DEFAULT_SECTION = 'General'

// Auto-generate a snake_case field_name from a label
function slugify(label) {
  return (label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'field'
}

function ensureUnique(name, existing) {
  if (!existing.includes(name)) return name
  let i = 2
  while (existing.includes(`${name}_${i}`)) i++
  return `${name}_${i}`
}

// ── Sortable field card ───────────────────────────────────────────────────────

function FieldCardBody({ field, isSelected, dragHandleProps, isDragOverlay }) {
  const meta = FT[field.field_type] || FT.text
  const Icon = meta.icon
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md border bg-card transition-all',
        isSelected
          ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
          : 'border-border hover:border-foreground/30 hover:bg-muted/30',
        isDragOverlay && 'shadow-lg ring-2 ring-primary/40 cursor-grabbing'
      )}
    >
      <span
        {...(dragHandleProps || {})}
        className="text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} />
      </span>
      <Icon size={14} className="text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">{field.field_label || '(untitled)'}</span>
          {field.required && <span className="text-[10px] text-destructive font-bold">*</span>}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-mono">{field.field_name || 'no_name'}</span>
          <span>·</span>
          <span>{meta.label}</span>
        </div>
      </div>
    </div>
  )
}

function SortableFieldCard({ field, isSelected, onSelect, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative cursor-pointer"
      onClick={onSelect}
    >
      <FieldCardBody
        field={field}
        isSelected={isSelected}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Delete"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ── Properties panel ──────────────────────────────────────────────────────────

function PropertiesPanel({ field, sections, onChange }) {
  if (!field) {
    return (
      <div className="text-center py-12 px-4 text-xs text-muted-foreground">
        <SettingsIcon size={20} className="mx-auto opacity-40 mb-2" />
        Select a field to edit its properties.
      </div>
    )
  }

  const update = (patch) => onChange({ ...field, ...patch })
  const updateValidation = (patch) =>
    onChange({ ...field, validation_rules: { ...(field.validation_rules || {}), ...patch } })

  const hasOptions = field.field_type === 'dropdown' || field.field_type === 'radio' || field.field_type === 'checkbox'

  return (
    <div className="space-y-4">
      <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground border-b border-border pb-2">
        Field Properties
      </div>

      {/* Type */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Type</label>
        <select
          value={field.field_type}
          onChange={(e) => update({ field_type: e.target.value })}
          className="w-full text-sm border border-border bg-background rounded-md px-2.5 py-1.5"
        >
          {['Input', 'Selection', 'Advanced'].map(group => (
            <optgroup key={group} label={group}>
              {FIELD_TYPES.filter(t => t.group === group).map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Section */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Section</label>
        <select
          value={field.section_name || DEFAULT_SECTION}
          onChange={(e) => update({ section_name: e.target.value })}
          className="w-full text-sm border border-border bg-background rounded-md px-2.5 py-1.5"
        >
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Label */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Label</label>
        <Input
          value={field.field_label || ''}
          onChange={(e) => update({ field_label: e.target.value })}
        />
      </div>

      {/* Field name */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">
          Internal name
          <span className="ml-1 text-[10px] text-muted-foreground font-normal">(snake_case key)</span>
        </label>
        <Input
          value={field.field_name || ''}
          onChange={(e) => update({ field_name: slugify(e.target.value) })}
          className="font-mono text-xs"
        />
      </div>

      {/* Placeholder */}
      {['text', 'textarea', 'number', 'currency', 'date'].includes(field.field_type) && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Placeholder</label>
          <Input
            value={field.placeholder || ''}
            onChange={(e) => update({ placeholder: e.target.value })}
          />
        </div>
      )}

      {/* Required + read-only toggles */}
      <div className="flex items-center gap-4 pt-1">
        <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) => update({ required: e.target.checked })}
          />
          Required
        </label>
        <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={!!field.read_only}
            onChange={(e) => update({ read_only: e.target.checked })}
          />
          Read-only
        </label>
      </div>

      {/* Default value */}
      {!hasOptions && field.field_type !== 'signature' && field.field_type !== 'file' && field.field_type !== 'table' && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Default value</label>
          <Input
            value={field.default_value || ''}
            onChange={(e) => update({ default_value: e.target.value })}
          />
        </div>
      )}

      {/* Options for dropdown/radio/checkbox */}
      {hasOptions && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Options (one per line)</label>
          <textarea
            value={(field.options || []).join('\n')}
            onChange={(e) =>
              update({ options: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })
            }
            rows={5}
            className="w-full text-sm border border-border bg-background rounded-md px-2.5 py-1.5 font-mono"
            placeholder={'Option A\nOption B\nOption C'}
          />
        </div>
      )}

      {/* Calculation formula */}
      {field.field_type === 'calculated' && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            Formula
            <span className="ml-1 text-[10px] text-muted-foreground font-normal">— reference other fields by name e.g. <code>qty * unit_price</code></span>
          </label>
          <Input
            value={field.calculation_formula || ''}
            onChange={(e) => update({ calculation_formula: e.target.value, calculation_enabled: true })}
            className="font-mono text-xs"
            placeholder="qty * unit_price"
          />
        </div>
      )}

      {/* Reference prefix */}
      {field.field_type === 'reference' && (
        <Alert className="text-xs">
          Reference numbers are auto-generated at form creation using the form's <strong>Code Suffix</strong>.
        </Alert>
      )}

      {/* Table columns — simple editor */}
      {field.field_type === 'table' && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Columns</label>
          <div className="space-y-1">
            {(field.table_columns || []).map((col, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <Input
                  value={col.label || ''}
                  onChange={(e) => {
                    const cols = [...(field.table_columns || [])]
                    cols[idx] = { ...cols[idx], label: e.target.value, key: slugify(e.target.value) || `col_${idx + 1}` }
                    update({ table_columns: cols })
                  }}
                  placeholder={`Column ${idx + 1}`}
                  className="flex-1 text-xs"
                />
                <select
                  value={col.type || 'text'}
                  onChange={(e) => {
                    const cols = [...(field.table_columns || [])]
                    cols[idx] = { ...cols[idx], type: e.target.value }
                    update({ table_columns: cols })
                  }}
                  className="text-xs border border-border bg-background rounded-md px-1.5 py-1"
                >
                  <option value="text">text</option>
                  <option value="number">number</option>
                  <option value="currency">currency</option>
                  <option value="date">date</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    update({ table_columns: (field.table_columns || []).filter((_, i) => i !== idx) })
                  }}
                  className="p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={() =>
              update({
                table_columns: [
                  ...(field.table_columns || []),
                  { key: `col_${(field.table_columns?.length || 0) + 1}`, label: '', type: 'text' },
                ],
              })
            }
          >
            <Plus size={12} className="mr-1" /> Add column
          </Button>
        </div>
      )}

      {/* Validation — only for inputs that take it */}
      {['text', 'textarea', 'number', 'currency'].includes(field.field_type) && (
        <div className="pt-2 space-y-1.5 border-t border-border">
          <div className="text-xs font-medium text-foreground">Validation</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground">Min</label>
              <Input
                type="number"
                value={field.validation_rules?.min ?? ''}
                onChange={(e) => updateValidation({ min: e.target.value === '' ? null : Number(e.target.value) })}
                className="text-xs"
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground">Max</label>
              <Input
                type="number"
                value={field.validation_rules?.max ?? ''}
                onChange={(e) => updateValidation({ max: e.target.value === '' ? null : Number(e.target.value) })}
                className="text-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label, count, hint }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 border-b-2 text-sm font-medium transition-colors -mb-px',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      )}
    >
      <Icon size={14} />
      <span>{label}</span>
      {hint ? (
        <span className="text-[10px] text-muted-foreground italic">{hint}</span>
      ) : count != null && count > 0 ? (
        <span className={cn(
          'text-[10px] font-bold px-1.5 rounded-full',
          active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
        )}>
          {count}
        </span>
      ) : null}
    </button>
  )
}

// ── Main designer page ───────────────────────────────────────────────────────

export default function FormDesigner() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: formDef, isLoading } = useQuery({
    queryKey: ['form-definition', id],
    queryFn: () => getFormDefinition(id).then(r => r.data),
  })
  const { data: org } = useQuery({
    queryKey: ['my-organization'],
    queryFn: () => getMyOrganization().then(r => r.data),
  })
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers().then(r => r.data),
  })
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => listRoles().then(r => r.data),
  })

  // Local working state — list of field drafts in render order.
  const [fields, setFields] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [sections, setSections] = useState([DEFAULT_SECTION])
  const [activeSection, setActiveSection] = useState(DEFAULT_SECTION)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrls, setPreviewUrls] = useState({ header: null, footer: null })
  // Tab + approval + initiator state
  const [tab, setTab] = useState('fields')          // 'fields' | 'approval' | 'initiator'
  const [approvalSteps, setApprovalSteps] = useState([])
  const [initiatorRoleIds, setInitiatorRoleIds] = useState([])
  const initRef = useRef(false)

  // Seed once we have form + roles + users (the step adapter needs them for
  // name resolution). Save-success re-seeds explicitly from the response.
  useEffect(() => {
    if (!formDef || initRef.current) return
    if (!roles.length || !users.length) return  // wait for lookup data
    seedFromForm(formDef)
    initRef.current = true
  }, [formDef, roles.length, users.length])

  const seedFromForm = (def) => {
    const loaded = (def.fields || []).map(f => ({
      ...f,
      section_name: f.section_name || DEFAULT_SECTION,
    }))
    setFields(loaded)
    const found = Array.from(new Set(loaded.map(f => f.section_name)))
    setSections(found.length ? found : [DEFAULT_SECTION])
    setActiveSection(prev => (found.includes(prev) ? prev : (found[0] || DEFAULT_SECTION)))
    setApprovalSteps(stepsFromApi(def.approval_template?.steps || [], roles, users))
    setInitiatorRoleIds(def.initiator_role_ids || [])
  }

  // Letterhead preview blob fetch
  useEffect(() => {
    if (!previewOpen || !org) return
    let revoked = false
    const urls = { header: null, footer: null }
    const promises = []
    if (org.has_header_image) promises.push(fetchHeaderImageObjectUrl().then(u => { urls.header = u }).catch(() => {}))
    if (org.has_footer_image) promises.push(fetchFooterImageObjectUrl().then(u => { urls.footer = u }).catch(() => {}))
    Promise.all(promises).then(() => { if (!revoked) setPreviewUrls(urls) })
    return () => {
      revoked = true
      if (urls.header) URL.revokeObjectURL(urls.header)
      if (urls.footer) URL.revokeObjectURL(urls.footer)
      setPreviewUrls({ header: null, footer: null })
    }
  }, [previewOpen, org])

  const fieldsInSection = useMemo(
    () => fields.filter(f => (f.section_name || DEFAULT_SECTION) === activeSection),
    [fields, activeSection]
  )

  const [activeDragId, setActiveDragId] = useState(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    setFields(prev => {
      // Reorder only within the visible section, then splice the result back
      // into the full list at the matching positions.
      const inSection = prev.filter(f => (f.section_name || DEFAULT_SECTION) === activeSection)
      const oldIdx = inSection.findIndex(f => f.id === active.id)
      const newIdx = inSection.findIndex(f => f.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return prev
      const reordered = arrayMove(inSection, oldIdx, newIdx)
      // Build the new global list preserving non-section fields in place
      const result = []
      let cursor = 0
      for (const f of prev) {
        if ((f.section_name || DEFAULT_SECTION) === activeSection) {
          result.push(reordered[cursor++])
        } else {
          result.push(f)
        }
      }
      return result
    })
  }

  const activeDragField = activeDragId ? fields.find(f => f.id === activeDragId) : null

  // Field operations
  const addField = (type) => {
    const baseLabel = FT[type]?.label || 'Field'
    const existingNames = fields.map(f => f.field_name)
    const tempId = `__new__${Date.now()}__${Math.random().toString(36).slice(2, 7)}`
    const newField = {
      id: tempId,                       // marked with __new__ so the server treats it as create
      field_name: ensureUnique(slugify(baseLabel), existingNames),
      field_label: baseLabel,
      field_type: type,
      section_name: activeSection,
      required: false,
      placeholder: '',
      options: type === 'dropdown' || type === 'radio' || type === 'checkbox' ? ['Option A', 'Option B'] : null,
      table_columns: type === 'table' ? [{ key: 'description', label: 'Description', type: 'text' }, { key: 'qty', label: 'Qty', type: 'number' }] : null,
    }
    setFields(prev => [...prev, newField])
    setSelectedId(tempId)
  }

  const updateField = (next) => {
    setFields(prev => prev.map(f => (f.id === next.id ? next : f)))
  }

  const deleteField = (fieldId) => {
    setFields(prev => prev.filter(f => f.id !== fieldId))
    if (selectedId === fieldId) setSelectedId(null)
  }

  // Section operations
  const addSection = () => {
    let name = 'New Section'
    let i = 2
    while (sections.includes(name)) name = `New Section ${i++}`
    setSections([...sections, name])
    setActiveSection(name)
  }
  const renameSection = (oldName, newName) => {
    if (!newName.trim() || sections.includes(newName)) return
    setSections(prev => prev.map(s => (s === oldName ? newName : s)))
    setFields(prev => prev.map(f => ((f.section_name || DEFAULT_SECTION) === oldName ? { ...f, section_name: newName } : f)))
    if (activeSection === oldName) setActiveSection(newName)
  }
  const deleteSection = (name) => {
    if (sections.length <= 1) return toast.error('At least one section is required.')
    const fallback = sections.find(s => s !== name)
    setSections(prev => prev.filter(s => s !== name))
    setFields(prev => prev.map(f => ((f.section_name || DEFAULT_SECTION) === name ? { ...f, section_name: fallback } : f)))
    if (activeSection === name) setActiveSection(fallback)
  }
  const moveSection = (idx, delta) => {
    setSections(prev => {
      const target = idx + delta
      if (target < 0 || target >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[target]] = [copy[target], copy[idx]]
      return copy
    })
  }

  // Save: persist fields + approval template + initiator-role restriction,
  // then refetch to ensure local state matches the server.
  const saveMut = useMutation({
    mutationFn: async () => {
      // 1) Fields
      const ordered = []
      sections.forEach(s => {
        fields.filter(f => (f.section_name || DEFAULT_SECTION) === s).forEach(f => ordered.push(f))
      })
      const payload = ordered.map(f => ({
        ...f,
        id: f.id && !String(f.id).startsWith('__new__') ? f.id : undefined,
      }))
      await replaceFormFields(id, payload)

      // 2) Approval template (only touch if the user has interacted with it
      // — i.e. there are steps OR there was already a template linked).
      const stepsPayload = stepsToApiPayload(approvalSteps)
      if (formDef?.approval_template_id) {
        await updateApprovalTemplate(formDef.approval_template_id, { steps: stepsPayload })
      } else if (stepsPayload.length > 0) {
        const res = await createApprovalTemplate({
          name: `${formDef?.name || 'Form'} Workflow`,
          steps: stepsPayload,
        })
        await updateFormDefinition(id, { approval_template_id: res.data.id })
      }

      // 3) Initiator role restriction — always send (empty list = open to all).
      await updateFormDefinition(id, { initiator_role_ids: initiatorRoleIds })

      // 4) Refetch
      const fresh = await getFormDefinition(id).then(r => r.data)
      return fresh
    },
    onSuccess: (fresh) => {
      toast.success('Form saved.')
      qc.setQueryData(['form-definition', id], fresh)
      seedFromForm(fresh)
      setSelectedId(prev => (fresh.fields || []).some(f => f.id === prev) ? prev : null)
      qc.invalidateQueries({ queryKey: ['form-definitions'] })
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Save failed.'),
  })

  const selectedField = fields.find(f => f.id === selectedId) || null

  if (isLoading || !formDef) {
    return (
      <div className="p-6">
        <div className="h-6 w-48 bg-muted rounded animate-pulse mb-3" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/admin/form-definitions')}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">
              {formDef.printed_title || formDef.name} <span className="text-muted-foreground font-normal">— Schema Designer</span>
            </h1>
            <p className="text-[10px] text-muted-foreground">
              {fields.length} field{fields.length === 1 ? '' : 's'} across {sections.length} section{sections.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye size={13} className="mr-1.5" /> Preview
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} size="sm">
            <Save size={13} className="mr-1.5" />
            {saveMut.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 border-b border-border bg-card">
        <TabButton active={tab === 'fields'}    onClick={() => setTab('fields')}    icon={SettingsIcon} label="Fields"    count={fields.length} />
        <TabButton active={tab === 'approval'}  onClick={() => setTab('approval')}  icon={Workflow}     label="Approval"  count={approvalSteps.length} />
        <TabButton active={tab === 'initiator'} onClick={() => setTab('initiator')} icon={ShieldCheck}  label="Initiator" count={initiatorRoleIds.length || null} hint={initiatorRoleIds.length === 0 ? 'All users' : null} />
      </div>

      {/* Body — three-pane for Fields, centered single panel for the others */}
      {tab === 'approval' && (
        <div className="flex-1 overflow-y-auto p-6">
          <ApprovalEditor
            steps={approvalSteps}
            onChange={setApprovalSteps}
            users={users}
            roles={roles}
          />
        </div>
      )}

      {tab === 'initiator' && (
        <div className="flex-1 overflow-y-auto p-6">
          <InitiatorRolesPanel
            roles={roles}
            selectedIds={initiatorRoleIds}
            onChange={setInitiatorRoleIds}
          />
        </div>
      )}

      {tab === 'fields' && (
      <div className="flex-1 grid grid-cols-[220px_1fr_280px] gap-0 overflow-hidden">
        {/* ── Sections ─────────────────────── */}
        <aside className="border-r border-border bg-muted/20 overflow-y-auto p-3 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 px-1">
            Sections
          </div>
          {sections.map((s, idx) => {
            const count = fields.filter(f => (f.section_name || DEFAULT_SECTION) === s).length
            const isActive = s === activeSection
            return (
              <div
                key={s}
                onClick={() => setActiveSection(s)}
                className={cn(
                  'group flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm cursor-pointer',
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'text-foreground hover:bg-muted border border-transparent'
                )}
              >
                <FolderOpen size={12} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                <span className="flex-1 truncate text-xs">{s}</span>
                <span className="text-[10px] text-muted-foreground">{count}</span>
                {isActive && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                    <button
                      type="button"
                      title="Rename"
                      onClick={(e) => { e.stopPropagation(); setRenameDraft(s); setRenameOpen(true) }}
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      type="button"
                      title="Move up"
                      disabled={idx === 0}
                      onClick={(e) => { e.stopPropagation(); moveSection(idx, -1) }}
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp size={11} />
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      disabled={idx === sections.length - 1}
                      onClick={(e) => { e.stopPropagation(); moveSection(idx, 1) }}
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown size={11} />
                    </button>
                    <button
                      type="button"
                      title="Delete section"
                      onClick={(e) => { e.stopPropagation(); deleteSection(s) }}
                      className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs mt-1" onClick={addSection}>
            <Plus size={12} className="mr-1" /> Add section
          </Button>
        </aside>

        {/* ── Field list (active section) ──── */}
        <main className="overflow-y-auto p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">{activeSection}</h2>
            <p className="text-xs text-muted-foreground">
              {fieldsInSection.length} field{fieldsInSection.length === 1 ? '' : 's'} in this section.
            </p>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setActiveDragId(e.active.id)}
            onDragCancel={() => setActiveDragId(null)}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={fieldsInSection.map(f => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {fieldsInSection.map(f => (
                  <SortableFieldCard
                    key={f.id}
                    field={f}
                    isSelected={selectedId === f.id}
                    onSelect={() => setSelectedId(f.id)}
                    onDelete={() => deleteField(f.id)}
                  />
                ))}
                {fieldsInSection.length === 0 && (
                  <div className="text-center py-8 text-xs text-muted-foreground border-2 border-dashed border-border rounded-md">
                    No fields yet. Add one from below.
                  </div>
                )}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeDragField ? (
                <FieldCardBody field={activeDragField} isSelected isDragOverlay />
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Add field menu */}
          <Card className="mt-6">
            <CardContent className="p-4 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add a field</div>
              {['Input', 'Selection', 'Advanced'].map(group => (
                <div key={group}>
                  <div className="text-[10px] text-muted-foreground/70 mb-1">{group}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {FIELD_TYPES.filter(t => t.group === group).map(t => {
                      const Icon = t.icon
                      return (
                        <button
                          key={t.value}
                          onClick={() => addField(t.value)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-md bg-card hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                        >
                          <Icon size={12} />
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </main>

        {/* ── Properties drawer ────────────── */}
        <aside className="border-l border-border bg-card overflow-y-auto p-4">
          <PropertiesPanel
            field={selectedField}
            sections={sections}
            onChange={updateField}
          />
        </aside>
      </div>
      )}

      {/* Rename section modal */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename section</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              placeholder="Section name"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                renameSection(activeSection, renameDraft.trim())
                setRenameOpen(false)
              }}
              disabled={!renameDraft.trim() || sections.includes(renameDraft.trim())}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Letterhead preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Letterhead preview</DialogTitle>
          </DialogHeader>
          <div className="bg-muted/30 rounded-lg p-4 max-h-[70vh] overflow-y-auto">
            <div className="mx-auto" style={{ width: 'min(560px, 100%)' }}>
              <LetterheadPage
                headerImageUrl={previewUrls.header}
                footerImageUrl={previewUrls.footer}
                accentColor={org?.letterhead_accent}
                classification={
                  formDef.confidentiality && (org?.classification_labels || []).find(l => l.name === formDef.confidentiality)
                    ? (org.classification_labels || []).find(l => l.name === formDef.confidentiality)
                    : null
                }
              >
                <div className="h-full overflow-hidden text-[10px] text-slate-800">
                  <div className="text-center">
                    <h1 className="text-[14px] font-bold" style={{ color: org?.letterhead_accent || '#0066B3' }}>
                      {formDef.printed_title || formDef.name}
                    </h1>
                  </div>
                  <div className="mt-3 space-y-3">
                    {sections.map(s => {
                      const inSec = fields.filter(f => (f.section_name || DEFAULT_SECTION) === s)
                      if (!inSec.length) return null
                      return (
                        <div key={s}>
                          <div className="font-semibold text-[10px] uppercase tracking-wide" style={{ color: org?.letterhead_accent || '#0066B3' }}>
                            {s}
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-0.5">
                            {inSec.map(f => (
                              <div key={f.id} className="flex items-baseline gap-1.5">
                                <span className="text-slate-500">{f.field_label}:</span>
                                <span className="font-medium text-slate-400 italic">[{FT[f.field_type]?.label}]</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </LetterheadPage>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
