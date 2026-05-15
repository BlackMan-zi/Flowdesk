import React, { useState } from 'react'
import { cn } from '../../lib/utils'
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown, GripVertical,
  Type, AlignLeft, Hash, DollarSign, Calendar,
  ChevronDown as ChevronDownIcon, CheckSquare, Circle,
  Calculator, Paperclip, PenLine, Hash as HashIcon,
  Table as TableIcon, MoreHorizontal,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Field types that always take the full body width (vs 2-column key:value)
const FULL_WIDTH_TYPES = new Set(['textarea', 'table', 'signature', 'file', 'calculated'])

const FIELD_TYPE_META = {
  text:       { label: 'Short Text',   icon: Type,            group: 'Input' },
  textarea:   { label: 'Paragraph',    icon: AlignLeft,       group: 'Input' },
  number:     { label: 'Number',       icon: Hash,            group: 'Input' },
  currency:   { label: 'Currency',     icon: DollarSign,      group: 'Input' },
  date:       { label: 'Date',         icon: Calendar,        group: 'Input' },
  dropdown:   { label: 'Dropdown',     icon: ChevronDownIcon, group: 'Selection' },
  radio:      { label: 'Radio',        icon: Circle,          group: 'Selection' },
  checkbox:   { label: 'Checkbox',     icon: CheckSquare,     group: 'Selection' },
  table:      { label: 'Table',        icon: TableIcon,       group: 'Advanced' },
  calculated: { label: 'Calculated',   icon: Calculator,      group: 'Advanced' },
  reference:  { label: 'Reference No', icon: HashIcon,        group: 'Advanced' },
  file:       { label: 'Attachment',   icon: Paperclip,       group: 'Advanced' },
  signature:  { label: 'Signature',    icon: PenLine,         group: 'Advanced' },
}

const FIELD_TYPES_LIST = [
  'text', 'textarea', 'number', 'currency', 'date',
  'dropdown', 'radio', 'checkbox',
  'table', 'calculated', 'reference', 'file', 'signature',
]

const DEFAULT_SECTION = 'General'

// ── Hierarchy labels ──────────────────────────────────────────────────────────

const HIERARCHY_LABELS = {
  manager:    'Line Manager',
  sn_manager: 'Senior Manager',
  hod:        'Head of Department',
}

// ── Field cell ────────────────────────────────────────────────────────────────

function previewValue(field) {
  if (field.default_value) return field.default_value
  switch (field.field_type) {
    case 'text':       return field.placeholder || 'Sample value'
    case 'number':     return field.placeholder || '0'
    case 'currency':   return field.placeholder || '0.00'
    case 'date':       return field.placeholder || 'DD / MM / YYYY'
    case 'dropdown':   return field.options?.[0] || 'Select…'
    case 'reference':  return `${field.placeholder || 'AUTO'}-2026-####`
    case 'calculated': return field.calculation_formula ? `= ${field.calculation_formula}` : 'Computed'
    default:           return ''
  }
}

function FieldCellBody({ field, accent, isSelected, isOverlay }) {
  const isFullWidth = FULL_WIDTH_TYPES.has(field.field_type)
  const meta = FIELD_TYPE_META[field.field_type] || FIELD_TYPE_META.text
  const preview = previewValue(field)

  return (
    <div
      className={cn(
        'relative rounded-md transition-colors',
        isSelected
          ? 'ring-2 ring-primary/40 bg-primary/5 border border-primary'
          : 'border border-transparent hover:bg-slate-100/60',
        isFullWidth ? 'px-3 py-2' : 'px-2 py-1.5',
        isOverlay && 'shadow-lg bg-white'
      )}
    >
      {field.required && (
        <span className="absolute top-1 right-1.5 text-[10px] text-destructive font-bold pointer-events-none">*</span>
      )}

      {field.field_type === 'textarea' ? (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: accent }}>
            {field.field_label || meta.label}
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded px-2 py-2 min-h-[56px] text-[11px] text-slate-400 italic">
            {field.placeholder || 'Paragraph response…'}
          </div>
        </>
      ) : field.field_type === 'table' ? (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: accent }}>
            {field.field_label || 'Table'}
          </p>
          <table className="w-full border border-slate-300 text-[10px]">
            <thead>
              <tr className="bg-slate-100">
                {(field.table_columns?.length
                  ? field.table_columns
                  : [{ key: 'col1', label: 'Column 1', type: 'text' }]
                ).map((c, i) => (
                  <th key={i} className="text-left px-2 py-1 border-b border-slate-300 font-semibold text-slate-600">{c.label || `Col ${i + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {(field.table_columns?.length ? field.table_columns : [{}]).map((_, i) => (
                  <td key={i} className="px-2 py-1 text-slate-400 italic">—</td>
                ))}
              </tr>
            </tbody>
          </table>
        </>
      ) : field.field_type === 'signature' ? (
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-slate-600 whitespace-nowrap">{field.field_label || 'Signature'}:</span>
          <div className="flex-1 border-b border-dashed border-slate-400 text-[10px] text-slate-300 italic pb-0.5">
            type or draw at fill time
          </div>
        </div>
      ) : field.field_type === 'file' ? (
        <div className="flex items-center gap-2">
          <Paperclip size={11} className="text-slate-400" />
          <span className="text-[11px] text-slate-600">{field.field_label || 'Attachment'}:</span>
          <span className="text-[10px] text-slate-400 italic">attach file(s) at fill time</span>
        </div>
      ) : field.field_type === 'calculated' ? (
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-slate-600 whitespace-nowrap">{field.field_label || 'Calculated'}:</span>
          <span className="text-[10px] font-mono text-slate-400 italic">{preview}</span>
        </div>
      ) : field.field_type === 'checkbox' ? (
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 border border-slate-400 rounded-sm bg-white" />
          <span className="text-[11px] text-slate-700">{field.field_label || meta.label}</span>
        </div>
      ) : field.field_type === 'radio' ? (
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 border border-slate-400 rounded-full bg-white" />
          <span className="text-[11px] text-slate-700">{field.field_label || meta.label}</span>
        </div>
      ) : (
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[11px] text-slate-600 whitespace-nowrap">{field.field_label || meta.label}:</span>
          <span className="text-[11px] text-slate-800 italic truncate flex-1">{preview}</span>
        </div>
      )}
    </div>
  )
}

function SortableFieldCell({ field, accent, isSelected, onSelect, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  const isFullWidth = FULL_WIDTH_TYPES.has(field.field_type)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group relative cursor-pointer', isFullWidth ? 'col-span-2' : '')}
      onClick={onSelect}
    >
      <FieldCellBody field={field} accent={accent} isSelected={isSelected} />
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute -left-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 touch-none"
        title="Drag to reorder"
      >
        <GripVertical size={12} />
      </span>
      {/* Hover delete */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute -right-5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-300 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100"
        title="Delete field"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

// ── Inline add-field popover ──────────────────────────────────────────────────

function AddFieldButton({ onAdd }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative col-span-2 mt-1">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-dashed border-slate-300 text-[11px] text-slate-500 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
      >
        <Plus size={12} /> Add field
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg p-2">
            {['Input', 'Selection', 'Advanced'].map(group => (
              <div key={group} className="mb-1.5 last:mb-0">
                <p className="text-[9px] uppercase tracking-wide text-slate-400 px-1 mb-0.5">{group}</p>
                <div className="flex flex-wrap gap-1">
                  {FIELD_TYPES_LIST.filter(t => FIELD_TYPE_META[t].group === group).map(t => {
                    const meta = FIELD_TYPE_META[t]
                    const Icon = meta.icon
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { onAdd(t); setOpen(false) }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded hover:border-primary hover:text-primary hover:bg-primary/5"
                      >
                        <Icon size={10} />
                        {meta.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Section block ─────────────────────────────────────────────────────────────

function SectionBlock({
  section, fields, accent, sectionIdx, totalSections,
  selectedFieldId, onSelectField, onAddField, onDeleteField,
  onRenameSection, onMoveSection, onDeleteSection,
  sensors, onDragStart, onDragEnd,
}) {
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(section)
  const [menuOpen, setMenuOpen] = useState(false)

  const commitRename = () => {
    setEditingName(false)
    const name = draftName.trim()
    if (name && name !== section) onRenameSection(name)
    else setDraftName(section)
  }

  return (
    <div className="mb-5 group/sec">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="h-[3px] w-3 rounded-full" style={{ backgroundColor: accent }} />
        {editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') { setDraftName(section); setEditingName(false) }
            }}
            className="text-[12px] font-semibold uppercase tracking-wide bg-transparent border-b border-slate-300 focus:outline-none focus:border-primary"
            style={{ color: accent, minWidth: 200 }}
          />
        ) : (
          <h2
            className="text-[12px] font-semibold uppercase tracking-wide cursor-text"
            style={{ color: accent }}
            onClick={() => { setDraftName(section); setEditingName(true) }}
            title="Click to rename"
          >
            {section}
          </h2>
        )}
        <div className="flex-1 h-px bg-slate-200" />
        <div className="relative opacity-0 group-hover/sec:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 text-slate-400 hover:text-slate-700"
            title="Section options"
          >
            <MoreHorizontal size={12} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute z-20 right-0 top-full mt-1 w-40 bg-white border border-border rounded-md shadow-lg py-1">
                <button onClick={() => { setDraftName(section); setEditingName(true); setMenuOpen(false) }} className="w-full text-left px-2.5 py-1 text-[11px] hover:bg-muted flex items-center gap-1.5">
                  <Pencil size={10} /> Rename
                </button>
                <button disabled={sectionIdx === 0} onClick={() => { onMoveSection(-1); setMenuOpen(false) }} className="w-full text-left px-2.5 py-1 text-[11px] hover:bg-muted disabled:text-slate-300 disabled:hover:bg-transparent flex items-center gap-1.5">
                  <ChevronUp size={10} /> Move up
                </button>
                <button disabled={sectionIdx === totalSections - 1} onClick={() => { onMoveSection(1); setMenuOpen(false) }} className="w-full text-left px-2.5 py-1 text-[11px] hover:bg-muted disabled:text-slate-300 disabled:hover:bg-transparent flex items-center gap-1.5">
                  <ChevronDown size={10} /> Move down
                </button>
                <button onClick={() => { onDeleteSection(); setMenuOpen(false) }} className="w-full text-left px-2.5 py-1 text-[11px] hover:bg-destructive/10 text-destructive flex items-center gap-1.5">
                  <Trash2 size={10} /> Delete section
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fields */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={(e) => onDragEnd(e, section)}
      >
        <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {fields.map(f => (
              <SortableFieldCell
                key={f.id}
                field={f}
                accent={accent}
                isSelected={selectedFieldId === f.id}
                onSelect={() => onSelectField(f.id)}
                onDelete={() => onDeleteField(f.id)}
              />
            ))}
            <AddFieldButton onAdd={onAddField} />
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

// ── Approval block (auto-rendered from the Approval tab) ──────────────────────

function ApprovalBlock({ steps, accent, users, roles }) {
  const resolve = (s) => {
    if (s.source_type === 'hierarchy')     return HIERARCHY_LABELS[s.hierarchy_level] || s.hierarchy_level
    if (s.source_type === 'role')          return s.role_name || roles.find(r => r.id === s.role_id)?.name || 'Role-based'
    if (s.source_type === 'specific_user') return s.specific_user_name || users.find(u => u.id === s.specific_user_id)?.name || 'Specific user'
    return 'Approver'
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-[3px] w-3 rounded-full" style={{ backgroundColor: accent }} />
        <h2 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
          Approvals
        </h2>
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[9px] text-slate-400 italic">auto-generated from Approval tab</span>
      </div>

      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-slate-600">
            <th className="text-left py-1 font-semibold w-1/3">Approver</th>
            <th className="text-left py-1 font-semibold">Signature</th>
            <th className="text-left py-1 font-semibold w-24">Date</th>
          </tr>
        </thead>
        <tbody>
          {/* Initiator row — always first */}
          <tr>
            <td className="py-2 pr-3">
              <div className="font-medium text-slate-700">Requested by</div>
              <div className="text-[9px] text-slate-400 italic">Logged-in user (auto)</div>
            </td>
            <td className="py-2 pr-3 align-bottom">
              <div className="border-b border-dashed border-slate-400 h-4" />
            </td>
            <td className="py-2 align-bottom">
              <div className="border-b border-dashed border-slate-400 h-4" />
            </td>
          </tr>
          {steps.map((s, idx) => (
            <tr key={s.id || idx}>
              <td className="py-2 pr-3">
                <div className="font-medium text-slate-700">{s.step_label || resolve(s)}</div>
                <div className="text-[9px] text-slate-400 italic">{resolve(s)}</div>
              </td>
              <td className="py-2 pr-3 align-bottom">
                <div className="border-b border-dashed border-slate-400 h-4" />
              </td>
              <td className="py-2 align-bottom">
                <div className="border-b border-dashed border-slate-400 h-4" />
              </td>
            </tr>
          ))}
          {steps.length === 0 && (
            <tr>
              <td colSpan={3} className="py-3 text-center text-[10px] text-slate-400 italic">
                No approval steps yet. Add them in the <strong>Approval</strong> tab and they'll appear here automatically.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Main canvas ───────────────────────────────────────────────────────────────

export default function FormDesignerCanvas({
  formDef, headerUrl, footerUrl, accent: accentProp, classification,
  sections, fields, approvalSteps, users, roles,
  selectedFieldId, onSelectField,
  onAddSection, onRenameSection, onMoveSection, onDeleteSection,
  onAddField, onDeleteField, onReorderFields,
}) {
  const accent = accentProp || '#0066B3'
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [, setActiveDragId] = useState(null)

  const handleDragEnd = (event, sectionName) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    onReorderFields(sectionName, active.id, over.id)
  }

  return (
    <div
      className="bg-white shadow-lg ring-1 ring-black/5 mx-auto overflow-hidden"
      style={{ width: 'min(720px, 100%)', minHeight: '85vh' }}
    >
      {/* Header band */}
      <div className="flex items-center justify-center px-12 py-4 h-24 border-b border-slate-100">
        {headerUrl ? (
          <img src={headerUrl} alt="Header" className="max-h-full max-w-full object-contain" />
        ) : (
          <div className="text-xs text-slate-400 italic">No header — upload in Settings.</div>
        )}
      </div>

      {/* Body */}
      <div className="px-12 py-6 relative">
        {/* Title + classification */}
        <div className="relative mb-4">
          {classification && (
            <span
              className="absolute right-0 top-0 inline-block text-[9px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded border"
              style={{
                color: classification.color || '#64748B',
                borderColor: `${classification.color || '#64748B'}80`,
                backgroundColor: `${classification.color || '#64748B'}15`,
              }}
            >
              {classification.name}
            </span>
          )}
          <div className="text-center">
            <h1 className="text-[16px] font-bold tracking-tight" style={{ color: accent }}>
              {formDef.printed_title || formDef.name}
            </h1>
            <div className="mx-auto mt-1 h-[2px] w-16 rounded-full" style={{ backgroundColor: accent }} />
          </div>
        </div>

        {/* Reference + Date row */}
        <div className="flex items-center justify-between text-[10px] text-slate-600 mb-4">
          <div>
            <span className="font-medium">Reference:</span>{' '}
            <span className="font-mono text-slate-400 italic">{formDef.code_suffix || 'AUTO'}-2026-####</span>
          </div>
          <div>
            <span className="font-medium">Date:</span> {today}
          </div>
        </div>

        {/* Sections */}
        {sections.map((s, idx) => {
          const inSection = fields.filter(f => (f.section_name || DEFAULT_SECTION) === s)
          return (
            <SectionBlock
              key={s}
              section={s}
              fields={inSection}
              accent={accent}
              sectionIdx={idx}
              totalSections={sections.length}
              selectedFieldId={selectedFieldId}
              onSelectField={onSelectField}
              onAddField={(t) => onAddField(s, t)}
              onDeleteField={onDeleteField}
              onRenameSection={(n) => onRenameSection(s, n)}
              onMoveSection={(d) => onMoveSection(idx, d)}
              onDeleteSection={() => onDeleteSection(s)}
              sensors={sensors}
              onDragStart={(e) => setActiveDragId(e.active.id)}
              onDragEnd={handleDragEnd}
            />
          )
        })}

        {/* Add section */}
        <button
          type="button"
          onClick={onAddSection}
          className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-slate-300 text-[11px] text-slate-500 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
        >
          <Plus size={12} /> Add section
        </button>

        {/* Approval block — auto-generated from the Approval tab */}
        <ApprovalBlock steps={approvalSteps} accent={accent} users={users} roles={roles} />
      </div>

      {/* Footer band */}
      <div className="flex items-end justify-center px-12 py-2 h-20 border-t border-slate-100">
        {footerUrl ? (
          <img src={footerUrl} alt="Footer" className="max-h-full max-w-full object-contain" />
        ) : (
          <div className="text-xs text-slate-400 italic mb-1">No footer — upload in Settings.</div>
        )}
      </div>
    </div>
  )
}
