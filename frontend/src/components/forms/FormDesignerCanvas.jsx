import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { cn } from '../../lib/utils'
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown, GripVertical,
  Type, AlignLeft, Hash, DollarSign, Calendar,
  ChevronDown as ChevronDownIcon, CheckSquare, Circle,
  Calculator, Paperclip, PenLine, Hash as HashIcon,
  Table as TableIcon, MoreHorizontal,
  Shield, Workflow, ClipboardList, Move, Text as TextIcon,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  rectSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { evaluate as evalFormula } from '../../lib/formula'

// ── Field type metadata ───────────────────────────────────────────────────────

export const FIELD_TYPE_META = {
  // Input
  text:        { label: 'Short Text',    icon: Type,            group: 'Input',    defaultWidth: '1/2', isSystem: false },
  textarea:    { label: 'Paragraph',     icon: AlignLeft,       group: 'Input',    defaultWidth: 'full', isSystem: false },
  number:      { label: 'Number',        icon: Hash,            group: 'Input',    defaultWidth: '1/2', isSystem: false },
  currency:    { label: 'Currency',      icon: DollarSign,      group: 'Input',    defaultWidth: '1/2', isSystem: false },
  date:        { label: 'Date',          icon: Calendar,        group: 'Input',    defaultWidth: '1/2', isSystem: false },
  // Selection
  dropdown:    { label: 'Dropdown',      icon: ChevronDownIcon, group: 'Selection',defaultWidth: '1/2', isSystem: false },
  radio:       { label: 'Radio',         icon: Circle,          group: 'Selection',defaultWidth: 'full',isSystem: false },
  checkbox:    { label: 'Checkbox',      icon: CheckSquare,     group: 'Selection',defaultWidth: 'full',isSystem: false },
  // Advanced
  table:       { label: 'Table',         icon: TableIcon,       group: 'Advanced', defaultWidth: 'full',isSystem: false },
  calculated:  { label: 'Calculated',    icon: Calculator,      group: 'Advanced', defaultWidth: '1/2', isSystem: false },
  file:        { label: 'Attachment',    icon: Paperclip,       group: 'Advanced', defaultWidth: 'full',isSystem: false },
  signature:   { label: 'Signature',     icon: PenLine,         group: 'Advanced', defaultWidth: 'full',isSystem: false },
  // Layout-only (admin-authored content, not user input)
  text_static:     { label: 'Static Text',      icon: TextIcon,       group: 'Layout', defaultWidth: 'full',isSystem: true },
  // System blocks (auto-filled, special render)
  reference:       { label: 'Reference No.',    icon: HashIcon,       group: 'System', defaultWidth: '1/3', isSystem: true },
  submission_date: { label: 'Submission Date',  icon: Calendar,       group: 'System', defaultWidth: '1/3', isSystem: true },
  classification:  { label: 'Classification',   icon: Shield,         group: 'System', defaultWidth: '1/4', isSystem: true },
  approval_block:  { label: 'Approval Section', icon: Workflow,       group: 'System', defaultWidth: 'full',isSystem: true },
}

export const FIELD_TYPES_LIST = [
  'text', 'textarea', 'number', 'currency', 'date',
  'dropdown', 'radio', 'checkbox',
  'table', 'calculated', 'file', 'signature',
  'text_static',
  'reference', 'submission_date', 'classification', 'approval_block',
]

// Width fraction → percentage (for free-positioned fields)
export const WIDTH_TO_PCT = {
  '1/4': 25, '1/3': 33.33, '1/2': 50, '2/3': 66.67, '3/4': 75, 'full': 100,
}

const DEFAULT_SECTION = 'General'

// Width fraction → 12-col span
const WIDTH_TO_SPAN = {
  '1/4': 3,
  '1/3': 4,
  '1/2': 6,
  '2/3': 8,
  '3/4': 9,
  'full': 12,
}

const HIERARCHY_LABELS = {
  manager:    'Line Manager',
  sn_manager: 'Senior Manager',
  hod:        'Head of Department',
}

// ── Field preview helpers ────────────────────────────────────────────────────

function previewValue(field) {
  if (field.default_value) return field.default_value
  switch (field.field_type) {
    case 'text':       return field.placeholder || 'Sample value'
    case 'number':     return field.placeholder || '0'
    case 'currency':   return field.placeholder || '0.00'
    case 'date':       return field.placeholder || 'DD / MM / YYYY'
    case 'dropdown':   return field.options?.[0] || 'Select…'
    case 'calculated': return field.calculation_formula ? `= ${field.calculation_formula}` : 'Computed'
    default:           return ''
  }
}

// ── Approval rows preview (placeholder names from steps) ──────────────────────

function ApprovalRows({ steps, accent, users, roles }) {
  const resolve = (s) => {
    if (s.source_type === 'hierarchy')     return HIERARCHY_LABELS[s.hierarchy_level] || s.hierarchy_level
    if (s.source_type === 'role')          return s.role_name || roles.find(r => r.id === s.role_id)?.name || 'Role-based'
    if (s.source_type === 'specific_user') return s.specific_user_name || users.find(u => u.id === s.specific_user_id)?.name || 'Specific user'
    return 'Approver'
  }

  return (
    <table className="w-full text-[10px]">
      <thead>
        <tr className="text-slate-600">
          <th className="text-left py-1 font-semibold w-1/3">Approver</th>
          <th className="text-left py-1 font-semibold">Signature</th>
          <th className="text-left py-1 font-semibold w-24">Date</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="py-2 pr-3">
            <div className="font-medium text-slate-700">Requested by</div>
            <div className="text-[9px] text-slate-400 italic">Logged-in user (auto)</div>
          </td>
          <td className="py-2 pr-3 align-bottom"><div className="border-b border-dashed border-slate-400 h-4" /></td>
          <td className="py-2 align-bottom"><div className="border-b border-dashed border-slate-400 h-4" /></td>
        </tr>
        {steps.map((s, idx) => (
          <tr key={s.id || idx}>
            <td className="py-2 pr-3">
              <div className="font-medium text-slate-700 flex items-center gap-1.5">
                {s.step_label || resolve(s)}
                {s.is_required === false && (
                  <span className="text-[8px] uppercase tracking-wide text-slate-400 font-semibold border border-slate-200 rounded px-1">optional</span>
                )}
              </div>
              <div className="text-[9px] text-slate-400 italic">{resolve(s)}</div>
            </td>
            <td className="py-2 pr-3 align-bottom"><div className="border-b border-dashed border-slate-400 h-4" /></td>
            <td className="py-2 align-bottom"><div className="border-b border-dashed border-slate-400 h-4" /></td>
          </tr>
        ))}
        {steps.length === 0 && (
          <tr>
            <td colSpan={3} className="py-3 text-center text-[10px] text-slate-400 italic">
              No approval steps yet. Add them in the <strong>Approval</strong> tab.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

// ── Field cell body — what the cell renders inside the grid ───────────────────

// ── Column-letter helper (A, B, C, ..., Z, AA, AB...) ────────────────────────

export function columnLetter(idx) {
  let n = idx
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

// Build a per-row context map for formula evaluation that includes BOTH
// the user's column keys AND Excel-style cell-letter aliases (A, A2, B, B2,
// ...). Row number is informational — letter alone or with number resolves
// to the same value within a per-row formula.
export function rowFormulaContext(row, columns, rowNumber = 2) {
  const ctx = { ...row }
  columns.forEach((c, i) => {
    const letter = columnLetter(i)
    const v = row[c.key]
    ctx[letter] = v
    ctx[`${letter}${rowNumber}`] = v
    // Also map row 1 for consistency (most users will write =B2*C2 anyway)
    ctx[`${letter}1`] = v
  })
  return ctx
}

// ── Table preview with drag-to-resize columns + column-letter headers ────────

function TablePreview({ field, accent, isSelected, onUpdate, selectedColumnIdx, onSelectColumn }) {
  const tableRef = useRef(null)

  const cols = field.table_columns?.length
    ? field.table_columns
    : [{ key: 'col1', label: 'Column 1', type: 'text' }]

  // Sample rows: 3 rows with 10, 20, 30 in numeric cols and "Item N" in text cols
  const sampleRows = [1, 2, 3].map(i => {
    const row = {}
    for (const c of cols) {
      row[c.key] = (c.type === 'number' || c.type === 'currency') ? i * 10 : `Item ${i}`
    }
    // Evaluate per-column formulas with both column-name AND Excel-letter context
    for (const c of cols) {
      if (c.formula) {
        const ctx = rowFormulaContext(row, cols, i + 1)
        row[c.key] = evalFormula(c.formula, ctx)
      }
    }
    return row
  })
  const totals = {}
  for (const c of cols) {
    if (c.show_total) {
      totals[c.key] = sampleRows.reduce((s, r) => s + (parseFloat(r[c.key]) || 0), 0)
    }
  }
  const hasTotals = Object.keys(totals).length > 0

  const startResize = (e, colIdx) => {
    if (!onUpdate || colIdx >= cols.length - 1) return
    e.preventDefault()
    e.stopPropagation()
    const table = tableRef.current
    if (!table) return
    const tableWidth = table.getBoundingClientRect().width
    const ths = Array.from(table.querySelectorAll('thead th'))
    if (ths.length < 2) return
    const initialPx = ths.map(th => th.getBoundingClientRect().width)
    const startX = e.clientX
    const MIN_PX = 36

    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const newPx = [...initialPx]
      // Adjust dragged column + immediate neighbour to preserve total width
      const moved = Math.max(
        MIN_PX - initialPx[colIdx],
        Math.min(initialPx[colIdx + 1] - MIN_PX, dx)
      )
      newPx[colIdx]     = initialPx[colIdx]     + moved
      newPx[colIdx + 1] = initialPx[colIdx + 1] - moved
      const updatedCols = cols.map((c, i) => ({
        ...c,
        width: `${((newPx[i] / tableWidth) * 100).toFixed(1)}%`,
      }))
      onUpdate({ ...field, table_columns: updatedCols })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const canResize = isSelected && !!onUpdate

  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: accent }}>
        {field.field_label || 'Table'}
      </p>
      <div className="relative">
        <table
          ref={tableRef}
          className="w-full border border-slate-300 text-[10px]"
          style={{ tableLayout: 'fixed' }}
        >
          <colgroup>
            {cols.map((c, i) => (
              <col key={i} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>
          <thead>
            {/* Column-letter strip (Excel-style A, B, C…) */}
            {isSelected && (
              <tr className="bg-slate-200 text-[8px] text-slate-600">
                {cols.map((c, i) => (
                  <th
                    key={i}
                    onClick={(e) => { e.stopPropagation(); onSelectColumn && onSelectColumn(i) }}
                    className={cn(
                      'text-center px-1 py-0.5 border-b border-slate-300 font-mono font-bold cursor-pointer select-none',
                      selectedColumnIdx === i ? 'bg-primary text-primary-foreground' : 'hover:bg-slate-300'
                    )}
                    title={`Column ${columnLetter(i)} — click to select`}
                  >
                    {columnLetter(i)}
                  </th>
                ))}
              </tr>
            )}
            {/* Column labels (admin-defined) */}
            <tr className="bg-slate-100">
              {cols.map((c, i) => (
                <th
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isSelected && onSelectColumn) onSelectColumn(i)
                  }}
                  className={cn(
                    'relative text-left px-2 py-1 border-b border-slate-300 font-semibold text-slate-600 truncate',
                    isSelected && 'cursor-pointer',
                    selectedColumnIdx === i && 'bg-primary/15 text-primary'
                  )}
                >
                  {c.label || `Col ${i + 1}`}
                  {c.formula && (
                    <span title={`= ${c.formula}`} className="ml-1 text-primary/70 font-mono">ƒ</span>
                  )}
                  {canResize && i < cols.length - 1 && (
                    <span
                      onPointerDown={(e) => startResize(e, i)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute -right-[3px] top-0 bottom-0 w-[6px] cursor-col-resize hover:bg-primary/40 active:bg-primary/60 z-10"
                      title="Drag to resize"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((row, ri) => (
              <tr key={ri}>
                {cols.map((c, ci) => (
                  <td key={ci} className="px-2 py-1 text-slate-500 italic border-b border-slate-100 truncate">
                    {typeof row[c.key] === 'string' && row[c.key].startsWith('#ERROR')
                      ? <span className="text-destructive not-italic">{row[c.key]}</span>
                      : String(row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {hasTotals && (
              <tr className="bg-slate-50 font-semibold">
                {cols.map((c, ci) => (
                  <td key={ci} className="px-2 py-1 text-slate-700 border-t border-slate-300 truncate">
                    {ci === 0 ? 'Total' : (c.show_total ? String(totals[c.key]) : '')}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
        {canResize && (
          <div className="mt-1 text-[9px] text-primary/60 italic">
            Drag the line between column headers to resize · click a column letter to edit it.
          </div>
        )}
      </div>
    </>
  )
}

function FieldCellBody({ field, accent, formDef, classification, approvalSteps, users, roles, isSelected, isOverlay, onUpdate, selectedColumnIdx, onSelectColumn }) {
  const meta = FIELD_TYPE_META[field.field_type] || FIELD_TYPE_META.text
  const preview = previewValue(field)

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div
      className={cn(
        'relative rounded-md transition-colors',
        isSelected
          ? 'ring-2 ring-primary/40 bg-primary/5 border border-primary'
          : 'border border-transparent hover:bg-slate-100/60',
        meta.isSystem ? 'px-3 py-2' : (meta.defaultWidth === 'full' ? 'px-3 py-2' : 'px-2 py-1.5'),
        isOverlay && 'shadow-lg bg-white'
      )}
    >
      {field.required && !meta.isSystem && (
        <span className="absolute top-1 right-1.5 text-[10px] text-destructive font-bold pointer-events-none">*</span>
      )}

      {/* ── Layout / system blocks ── */}
      {field.field_type === 'text_static' && (
        <div className="text-[11px] text-slate-700 whitespace-pre-wrap leading-snug py-1">
          {field.default_value || (
            <span className="text-slate-400 italic">Click to edit static text — write instructions, headings, or any copy you want on the form.</span>
          )}
        </div>
      )}
      {field.field_type === 'reference' && (
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-slate-600">{field.field_label || 'Reference'}:</span>
          <span className="text-[11px] font-mono text-slate-500 italic truncate">
            {formDef?.code_suffix || 'AUTO'}-2026-####
          </span>
        </div>
      )}
      {field.field_type === 'submission_date' && (
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-slate-600">{field.field_label || 'Date'}:</span>
          <span className="text-[11px] text-slate-700 italic">{today}</span>
        </div>
      )}
      {field.field_type === 'classification' && (
        <div className="flex items-center justify-center">
          {classification ? (
            <span
              className="inline-block text-[9px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded border"
              style={{
                color: classification.color || '#64748B',
                borderColor: `${classification.color || '#64748B'}80`,
                backgroundColor: `${classification.color || '#64748B'}15`,
              }}
            >
              {classification.name}
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 italic">Set classification in form settings</span>
          )}
        </div>
      )}
      {field.field_type === 'approval_block' && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-[3px] w-3 rounded-full" style={{ backgroundColor: accent }} />
            <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
              {field.field_label || 'Approvals'}
            </h2>
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[9px] text-slate-400 italic">auto from Approval tab</span>
          </div>
          <ApprovalRows steps={approvalSteps || []} accent={accent} users={users} roles={roles} />
        </div>
      )}

      {/* ── Regular field types ── */}
      {field.field_type === 'textarea' && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: accent }}>
            {field.field_label || meta.label}
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded px-2 py-2 min-h-[56px] text-[11px] text-slate-400 italic">
            {field.placeholder || 'Paragraph response…'}
          </div>
        </>
      )}
      {field.field_type === 'table' && (
        <TablePreview
          field={field}
          accent={accent}
          isSelected={isSelected}
          onUpdate={onUpdate}
          selectedColumnIdx={selectedColumnIdx}
          onSelectColumn={onSelectColumn}
        />
      )}
      {field.field_type === 'signature' && (
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-slate-600 whitespace-nowrap">{field.field_label || 'Signature'}:</span>
          <div className="flex-1 border-b border-dashed border-slate-400 text-[10px] text-slate-300 italic pb-0.5">
            type or draw at fill time
          </div>
        </div>
      )}
      {field.field_type === 'file' && (
        <div className="flex items-center gap-2">
          <Paperclip size={11} className="text-slate-400" />
          <span className="text-[11px] text-slate-600">{field.field_label || 'Attachment'}:</span>
          <span className="text-[10px] text-slate-400 italic">attach file(s) at fill time</span>
        </div>
      )}
      {field.field_type === 'calculated' && (
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-slate-600 whitespace-nowrap">{field.field_label || 'Calculated'}:</span>
          <span className="text-[10px] font-mono text-slate-400 italic">{preview}</span>
        </div>
      )}
      {field.field_type === 'checkbox' && (
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 border border-slate-400 rounded-sm bg-white" />
          <span className="text-[11px] text-slate-700">{field.field_label || meta.label}</span>
        </div>
      )}
      {field.field_type === 'radio' && (
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 border border-slate-400 rounded-full bg-white" />
          <span className="text-[11px] text-slate-700">{field.field_label || meta.label}</span>
        </div>
      )}
      {(field.field_type === 'text' || field.field_type === 'number'
        || field.field_type === 'currency' || field.field_type === 'date'
        || field.field_type === 'dropdown') && (
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[11px] text-slate-600 whitespace-nowrap">{field.field_label || meta.label}:</span>
          <span className="text-[11px] text-slate-800 italic truncate flex-1">{preview}</span>
        </div>
      )}
    </div>
  )
}

// ── Sortable wrapper ──────────────────────────────────────────────────────────

function SortableFieldCell({ field, accent, formDef, classification, approvalSteps, users, roles, isSelected, onSelect, onUpdate, onDelete, selectedColumnIdx, onSelectColumn }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id })

  const span = WIDTH_TO_SPAN[field.grid_width || FIELD_TYPE_META[field.field_type]?.defaultWidth || 'full']

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    gridColumn: `span ${span} / span ${span}`,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative cursor-pointer"
      onClick={onSelect}
    >
      <FieldCellBody
        field={field}
        accent={accent}
        formDef={formDef}
        classification={classification}
        approvalSteps={approvalSteps}
        users={users}
        roles={roles}
        isSelected={isSelected}
        onUpdate={onUpdate}
        selectedColumnIdx={selectedColumnIdx}
        onSelectColumn={onSelectColumn}
      />
      <span
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute -left-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 touch-none"
        title="Drag to reorder"
      >
        <GripVertical size={12} />
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className={cn(
          'absolute -right-5 top-1/2 -translate-y-1/2 p-0.5 rounded transition-opacity',
          'hover:text-destructive hover:bg-destructive/10',
          isSelected
            ? 'opacity-100 text-destructive'
            : 'opacity-0 group-hover:opacity-100 text-slate-300'
        )}
        title="Delete field"
      >
        <Trash2 size={isSelected ? 13 : 11} />
      </button>
    </div>
  )
}

// ── Add-field popover ─────────────────────────────────────────────────────────

function AddFieldButton({ onAdd }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative col-span-12 mt-1">
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
          <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg p-2 max-w-xl">
            {['Input', 'Selection', 'Advanced', 'System'].map(group => (
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
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 text-[10px] border rounded hover:border-primary hover:text-primary hover:bg-primary/5',
                          meta.isSystem ? 'border-primary/30 text-primary/80 bg-primary/5' : 'border-border'
                        )}
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

// ── Free-position field (absolutely placed on the body) ──────────────────────

function FreeField({
  field, accent, formDef, classification, approvalSteps, users, roles,
  isSelected, onSelect, onUpdate, onDelete, bodyRef,
}) {
  const widthPct = WIDTH_TO_PCT[field.grid_width || 'full']

  const handlePointerDown = (e) => {
    // Don't start drag on a child interactive element
    if (e.target.closest('button, input, textarea, select')) return
    e.preventDefault()
    e.stopPropagation()
    onSelect()
    const body = bodyRef.current
    if (!body) return
    const rect = body.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const startXPct = field.x_pct ?? 0
    const startYPct = field.y_pct ?? 0

    const onMove = (ev) => {
      const dxPct = ((ev.clientX - startX) / rect.width) * 100
      const dyPct = ((ev.clientY - startY) / rect.height) * 100
      // Clamp so the field doesn't fly off the page
      const newX = Math.max(0, Math.min(100 - widthPct, startXPct + dxPct))
      const newY = Math.max(0, Math.min(100, startYPct + dyPct))
      onUpdate({ ...field, x_pct: newX, y_pct: newY })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className={cn(
        'group absolute cursor-move select-none touch-none',
        isSelected && 'z-20'
      )}
      style={{
        left: `${field.x_pct ?? 0}%`,
        top: `${field.y_pct ?? 0}%`,
        width: `${widthPct}%`,
      }}
      onPointerDown={handlePointerDown}
    >
      <FieldCellBody
        field={field}
        accent={accent}
        formDef={formDef}
        classification={classification}
        approvalSteps={approvalSteps}
        users={users}
        roles={roles}
        isSelected={isSelected}
        onUpdate={onUpdate}
      />
      <span
        className="absolute -left-5 top-1/2 -translate-y-1/2 text-primary/60 opacity-0 group-hover:opacity-100 pointer-events-none"
        title="Drag anywhere"
      >
        <Move size={12} />
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className={cn(
          'absolute -right-5 top-1/2 -translate-y-1/2 p-0.5 rounded transition-opacity',
          'hover:text-destructive hover:bg-destructive/10',
          isSelected
            ? 'opacity-100 text-destructive'
            : 'opacity-0 group-hover:opacity-100 text-slate-300'
        )}
        title="Delete field"
      >
        <Trash2 size={isSelected ? 13 : 11} />
      </button>
    </div>
  )
}

// ── Page-break dashed lines (visual A4 boundaries) ────────────────────────────

function PageBreaks({ bodyRef, accent }) {
  const [pageCount, setPageCount] = useState(1)
  const [pageHeight, setPageHeight] = useState(0)

  useEffect(() => {
    if (!bodyRef.current) return
    const calc = () => {
      const body = bodyRef.current
      if (!body) return
      // Use the body's actual width to derive A4-correct page height.
      // A4 portrait ratio = 1 : √2 ≈ 1.4142. Allow some margin for header/footer.
      const w = body.clientWidth
      // ~80% of A4 height is content (the rest is header/footer); roughly w * 1.13
      const ph = Math.round(w * 1.13)
      const h = body.scrollHeight
      setPageHeight(ph)
      setPageCount(Math.max(1, Math.ceil(h / ph)))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(bodyRef.current)
    return () => ro.disconnect()
  }, [bodyRef])

  if (pageCount <= 1 || pageHeight <= 0) return null

  return (
    <>
      {Array.from({ length: pageCount - 1 }).map((_, i) => (
        <div
          key={i}
          className="absolute left-0 right-0 pointer-events-none"
          style={{ top: `${(i + 1) * pageHeight}px` }}
        >
          <div className="border-t-2 border-dashed border-slate-300" />
          <span
            className="absolute right-0 -top-3 text-[9px] font-semibold uppercase tracking-wide bg-white px-1.5 py-0.5 rounded border border-slate-200"
            style={{ color: accent }}
          >
            Page {i + 2}
          </span>
        </div>
      ))}
    </>
  )
}

// ── Section block ─────────────────────────────────────────────────────────────

function SectionBlock({
  section, fields, accent, formDef, classification, approvalSteps, users, roles,
  sectionIdx, totalSections,
  selectedFieldId, onSelectField, onAddField, onUpdateField, onDeleteField,
  selectedColumnIdx, onSelectColumn,
  onRenameSection, onMoveSection, onDeleteSection,
  sensors, onDragEnd,
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => onDragEnd(e, section)}
      >
        <SortableContext items={fields.map(f => f.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-12 gap-x-4 gap-y-1.5">
            {fields.map(f => (
              <SortableFieldCell
                key={f.id}
                field={f}
                accent={accent}
                formDef={formDef}
                classification={classification}
                approvalSteps={approvalSteps}
                users={users}
                roles={roles}
                isSelected={selectedFieldId === f.id}
                onSelect={() => onSelectField(f.id)}
                onUpdate={onUpdateField}
                onDelete={() => onDeleteField(f.id)}
                selectedColumnIdx={selectedFieldId === f.id ? selectedColumnIdx : null}
                onSelectColumn={selectedFieldId === f.id ? onSelectColumn : null}
              />
            ))}
            {fields.length === 0 && (
              <div className="col-span-12 text-center py-3 text-[11px] text-muted-foreground italic border border-dashed border-border rounded-md">
                Empty — pick a field type from the toolbox on the left.
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

// ── Main canvas ───────────────────────────────────────────────────────────────

export default function FormDesignerCanvas({
  formDef, headerUrl, footerUrl, accent: accentProp, classification,
  sections, fields, approvalSteps, users, roles,
  selectedFieldId, onSelectField,
  selectedColumnIdx, onSelectColumn,
  onAddSection, onRenameSection, onMoveSection, onDeleteSection,
  onAddField, onUpdateField, onDeleteField, onReorderFields,
}) {
  const accent = accentProp || '#0066B3'
  const bodyRef = useRef(null)

  // Split flow fields (grid-positioned) vs free fields (absolutely positioned).
  const flowFields = fields.filter(f => !f.free_position)
  const freeFields = fields.filter(f => f.free_position)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event, sectionName) => {
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
      <div ref={bodyRef} className="px-12 py-6 relative" data-canvas-body>
        {/* A4 page-break dashed lines + label */}
        <PageBreaks bodyRef={bodyRef} accent={accent} />

        {/* Free-positioned fields render in an overlay above the section flow */}
        {freeFields.map(f => (
          <FreeField
            key={f.id}
            field={f}
            accent={accent}
            formDef={formDef}
            classification={classification}
            approvalSteps={approvalSteps}
            users={users}
            roles={roles}
            isSelected={selectedFieldId === f.id}
            onSelect={() => onSelectField(f.id)}
            onUpdate={onUpdateField}
            onDelete={() => onDeleteField(f.id)}
            bodyRef={bodyRef}
          />
        ))}

        {/* Title only — Reference / Date / Classification / Approvals are
            now placeable system blocks that you drop wherever you want. */}
        <div className="text-center mb-4">
          <h1 className="text-[16px] font-bold tracking-tight" style={{ color: accent }}>
            {formDef.printed_title || formDef.name}
          </h1>
          <div className="mx-auto mt-1 h-[2px] w-16 rounded-full" style={{ backgroundColor: accent }} />
        </div>

        {/* Sections (flow only — free fields rendered above) */}
        {sections.map((s, idx) => {
          const inSection = flowFields.filter(f => (f.section_name || DEFAULT_SECTION) === s)
          return (
            <SectionBlock
              key={s}
              section={s}
              fields={inSection}
              accent={accent}
              formDef={formDef}
              classification={classification}
              approvalSteps={approvalSteps}
              users={users}
              roles={roles}
              sectionIdx={idx}
              totalSections={sections.length}
              selectedFieldId={selectedFieldId}
              onSelectField={onSelectField}
              selectedColumnIdx={selectedColumnIdx}
              onSelectColumn={onSelectColumn}
              onAddField={(t) => onAddField(s, t)}
              onUpdateField={onUpdateField}
              onDeleteField={onDeleteField}
              onRenameSection={(n) => onRenameSection(s, n)}
              onMoveSection={(d) => onMoveSection(idx, d)}
              onDeleteSection={() => onDeleteSection(s)}
              sensors={sensors}
              onDragEnd={handleDragEnd}
            />
          )
        })}

        <button
          type="button"
          onClick={onAddSection}
          className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-slate-300 text-[11px] text-slate-500 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
        >
          <Plus size={12} /> Add section
        </button>

        {sections.every(s => fields.filter(f => (f.section_name || DEFAULT_SECTION) === s).length === 0) && (
          <div className="mt-6 p-4 rounded-md border border-dashed border-primary/30 bg-primary/5 text-[11px] text-primary/80">
            <p className="font-medium mb-1 flex items-center gap-1.5"><ClipboardList size={11} /> Tip</p>
            <p>Reference, Date, Classification, and Approval are now <strong>placeable blocks</strong> — find them under <strong>System</strong> in the Add-field menu. Drop them anywhere on the page.</p>
          </div>
        )}
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
