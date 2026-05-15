import React, { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
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
  updateFormDefinition, deleteFormDefinition,
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
import FormDesignerCanvas, { FIELD_TYPE_META, FIELD_TYPES_LIST, columnLetter } from '../../components/forms/FormDesignerCanvas'
import FormFillerCanvas from '../../components/forms/FormFillerCanvas'
import Toolbox from '../../components/forms/Toolbox'
import { evaluate as evalFormula, SUPPORTED_FUNCTIONS } from '../../lib/formula'
import LetterheadPage from '../../components/letterhead/LetterheadPage'
import {
  fetchHeaderImageObjectUrl, fetchFooterImageObjectUrl,
} from '../../api/settings'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/Modal'

// ── Field type catalogue (shared with canvas) ────────────────────────────────

const FT = FIELD_TYPE_META

const DEFAULT_SECTION = 'General'

const WIDTH_OPTIONS = [
  { value: '1/4',  label: '1/4 (25%)' },
  { value: '1/3',  label: '1/3 (33%)' },
  { value: '1/2',  label: '1/2 (50%)' },
  { value: '2/3',  label: '2/3 (66%)' },
  { value: '3/4',  label: '3/4 (75%)' },
  { value: 'full', label: 'Full width' },
]

// System block types → API representation.
// System blocks aren't real input fields — they're rendered specially based on
// auto_fill_source. We store them as text/date with a known auto_fill_source so
// existing approval/instance code keeps working without schema migrations on
// the FieldType enum.
const SYSTEM_BLOCK_TO_API = {
  reference:       { field_type: 'text', auto_fill_source: 'reference_number' },
  submission_date: { field_type: 'date', auto_fill_source: 'submission_date' },
  classification:  { field_type: 'text', auto_fill_source: 'form_classification' },
  approval_block:  { field_type: 'text', auto_fill_source: 'approval_block' },
  text_static:     { field_type: 'text', auto_fill_source: 'static_text' },
}

// Reverse lookup: auto_fill_source → UI type
const API_TO_SYSTEM_BLOCK = Object.fromEntries(
  Object.entries(SYSTEM_BLOCK_TO_API).map(([ui, api]) => [api.auto_fill_source, ui])
)

function toApiField(f) {
  const sys = SYSTEM_BLOCK_TO_API[f.field_type]
  if (sys) {
    return {
      ...f,
      field_type: sys.field_type,
      auto_filled: true,
      auto_fill_source: sys.auto_fill_source,
    }
  }
  return f
}

function fromApiField(f) {
  if (f.auto_fill_source && API_TO_SYSTEM_BLOCK[f.auto_fill_source]) {
    return { ...f, field_type: API_TO_SYSTEM_BLOCK[f.auto_fill_source] }
  }
  return f
}

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

// ── Properties panel ──────────────────────────────────────────────────────────

// Build a sample context (field name → value) used to preview formulas
// while designing. Numeric types get 100, currency 1000, table fields
// get 3 rows of sample numbers across numeric columns.
function buildSampleContext(fields) {
  const ctx = {}
  for (const f of fields) {
    const key = f.field_name
    if (!key) continue
    switch (f.field_type) {
      case 'number':     ctx[key] = 100; break
      case 'currency':   ctx[key] = 1000; break
      case 'date':       ctx[key] = new Date().toISOString().slice(0, 10); break
      case 'text':       ctx[key] = 'Sample'; break
      case 'textarea':   ctx[key] = 'Sample text'; break
      case 'dropdown':   ctx[key] = f.options?.[0] || ''; break
      case 'radio':      ctx[key] = f.options?.[0] || ''; break
      case 'checkbox':   ctx[key] = false; break
      case 'table': {
        const cols = f.table_columns || []
        ctx[key] = [1, 2, 3].map(i => {
          const row = {}
          for (const c of cols) {
            row[c.key] = c.type === 'number' || c.type === 'currency' ? i * 10 : `Item ${i}`
          }
          return row
        })
        break
      }
      default: ctx[key] = ''
    }
  }
  return ctx
}

// ── Calculation editor — formula input + live preview + reference helpers ────

function CalculationEditor({ field, allFields, onChange }) {
  const formula = field.calculation_formula || ''
  const sampleContext = useMemo(() => buildSampleContext(allFields), [allFields])
  const result = useMemo(() => {
    if (!formula.trim()) return null
    return evalFormula(formula, sampleContext)
  }, [formula, sampleContext])

  const isError = typeof result === 'string' && result.startsWith('#ERROR')

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">
        Formula
        <span className="ml-1 text-[10px] text-muted-foreground font-normal">
          — e.g. <code>qty * unit_price</code> or <code>SUM(items.total)</code>
        </span>
      </label>
      <Input
        value={formula}
        onChange={(e) => onChange({ ...field, calculation_formula: e.target.value, calculation_enabled: true })}
        className="font-mono text-xs"
        placeholder="qty * unit_price"
      />
      {formula.trim() && (
        <div className={cn(
          'rounded-md border px-2 py-1.5 text-[10px]',
          isError
            ? 'border-destructive/40 bg-destructive/5 text-destructive'
            : 'border-border bg-muted/30 text-foreground'
        )}>
          <span className="text-muted-foreground">With sample values: </span>
          <span className="font-mono font-medium">{isError ? result : String(result ?? '')}</span>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground leading-snug">
        Available: {SUPPORTED_FUNCTIONS.join(', ')}. Reference table columns with <code>tableName.columnName</code>.
      </p>
    </div>
  )
}

function PropertiesPanel({ field, fields = [], sections, onChange }) {
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
  const isSystem = FT[field.field_type]?.isSystem

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
          {['Input', 'Selection', 'Advanced', 'System'].map(group => (
            <optgroup key={group} label={group}>
              {FIELD_TYPES_LIST.filter(t => FT[t].group === group).map(t => (
                <option key={t} value={t}>{FT[t].label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Width */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Width</label>
        <select
          value={field.grid_width || FT[field.field_type]?.defaultWidth || 'full'}
          onChange={(e) => update({ grid_width: e.target.value })}
          className="w-full text-sm border border-border bg-background rounded-md px-2.5 py-1.5"
        >
          {WIDTH_OPTIONS.map(w => (
            <option key={w.value} value={w.value}>{w.label}</option>
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

      {/* Required + read-only toggles (hidden for system blocks that aren't user input) */}
      {!isSystem && (
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
      )}

      {/* Free position toggle — Word-style drag-anywhere */}
      <div className="pt-2 border-t border-border space-y-2">
        <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={!!field.free_position}
            onChange={(e) => update({ free_position: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Free position</span>
            <span className="block text-[10px] text-muted-foreground leading-snug">
              Pull this field out of the grid and drag it anywhere on the page.
            </span>
          </span>
        </label>
        {field.free_position && (
          <div className="grid grid-cols-2 gap-2 pl-5">
            <div>
              <label className="text-[10px] text-muted-foreground">X (%)</label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={Math.round((field.x_pct ?? 0) * 10) / 10}
                onChange={(e) => update({ x_pct: Number(e.target.value) || 0 })}
                className="text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Y (%)</label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={Math.round((field.y_pct ?? 0) * 10) / 10}
                onChange={(e) => update({ y_pct: Number(e.target.value) || 0 })}
                className="text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* Static text content editor */}
      {field.field_type === 'text_static' && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Text content</label>
          <textarea
            value={field.default_value || ''}
            onChange={(e) => update({ default_value: e.target.value })}
            rows={5}
            className="w-full text-sm border border-border bg-background rounded-md px-2.5 py-1.5"
            placeholder="Write instruction copy, headings, or any text you want shown on the form."
          />
        </div>
      )}

      {/* Default value */}
      {!hasOptions && !isSystem && field.field_type !== 'signature' && field.field_type !== 'file' && field.field_type !== 'table' && (
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

      {/* Calculation formula with live preview */}
      {field.field_type === 'calculated' && (
        <CalculationEditor field={field} allFields={fields} onChange={update} />
      )}

      {/* Reference prefix */}
      {field.field_type === 'reference' && (
        <Alert className="text-xs">
          Reference numbers are auto-generated at form creation using the form's <strong>Code Suffix</strong>.
        </Alert>
      )}

      {/* Table columns — full editor with width, formula, show-total */}
      {field.field_type === 'table' && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">Columns</label>
          <p className="text-[10px] text-muted-foreground -mt-1">
            Resize a column by dragging the line between headers on the canvas (table must be selected).
          </p>
          <div className="space-y-2">
            {(field.table_columns || []).map((col, idx) => (
              <div key={idx} className="border border-border rounded-md p-2 space-y-1.5 bg-muted/20">
                <div className="flex items-center gap-1">
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
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!col.show_total}
                    onChange={(e) => {
                      const cols = [...(field.table_columns || [])]
                      cols[idx] = { ...cols[idx], show_total: e.target.checked }
                      update({ table_columns: cols })
                    }}
                  />
                  <span className="text-[10px] text-foreground">Show total at the bottom</span>
                </label>
                {col.show_total && (
                  <div>
                    <label className="text-[10px] text-muted-foreground">
                      Total formula
                      <span className="ml-1 text-muted-foreground/70">
                        — defaults to <code>SUM({columnLetter(idx)})</code>. Use ranges like <code>{columnLetter(idx)}2:{columnLetter(idx)}5</code>, or any expression.
                      </span>
                    </label>
                    <Input
                      value={col.total_formula || ''}
                      onChange={(e) => {
                        const cols = [...(field.table_columns || [])]
                        cols[idx] = { ...cols[idx], total_formula: e.target.value }
                        update({ table_columns: cols })
                      }}
                      placeholder={`SUM(${columnLetter(idx)})`}
                      className="font-mono text-xs"
                    />
                  </div>
                )}
                {(col.type === 'number' || col.type === 'currency') && (
                  <div>
                    <label className="text-[10px] text-muted-foreground">
                      Per-row formula
                      <span className="ml-1 text-muted-foreground/70">— other columns by name, e.g. <code>qty * unit_cost</code></span>
                    </label>
                    <Input
                      value={col.formula || ''}
                      onChange={(e) => {
                        const cols = [...(field.table_columns || [])]
                        cols[idx] = { ...cols[idx], formula: e.target.value }
                        update({ table_columns: cols })
                      }}
                      placeholder="qty * unit_cost"
                      className="font-mono text-xs"
                    />
                  </div>
                )}
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

// ── Formula bar (top) ────────────────────────────────────────────────────────

const FormulaBar = forwardRef(function FormulaBar({ selectedField, selectedColumnIdx, onUpdateField }, ref) {
  // Decide what the formula bar is editing:
  //  - calculated field         → field.calculation_formula
  //  - selected table column    → field.table_columns[idx].formula
  //  - otherwise                → disabled / hint
  const target = (() => {
    if (!selectedField) return null
    if (selectedField.field_type === 'calculated') {
      return {
        scope: 'calculated',
        formula: selectedField.calculation_formula || '',
        label: `${selectedField.field_label || 'Calculated'}`,
        commit: (v) => onUpdateField({ ...selectedField, calculation_formula: v, calculation_enabled: true }),
      }
    }
    if (selectedField.field_type === 'table' && selectedColumnIdx != null) {
      const col = selectedField.table_columns?.[selectedColumnIdx]
      if (!col) return null
      return {
        scope: 'column',
        formula: col.formula || '',
        label: `Column ${columnLetter(selectedColumnIdx)} · ${col.label || col.key}`,
        commit: (v) => {
          const cols = [...(selectedField.table_columns || [])]
          cols[selectedColumnIdx] = { ...cols[selectedColumnIdx], formula: v }
          onUpdateField({ ...selectedField, table_columns: cols })
        },
      }
    }
    return null
  })()

  const [draft, setDraft] = useState('')
  useEffect(() => { setDraft(target?.formula || '') }, [target?.scope, target?.label])

  const inputRef = useRef(null)

  // Exposed so the canvas can click a cell and have its address (e.g. "B2")
  // injected at the formula bar's caret position.
  useImperativeHandle(ref, () => ({
    insertCellRef(addr) {
      if (!target || !inputRef.current) return false
      const input = inputRef.current
      const start = input.selectionStart ?? draft.length
      const end   = input.selectionEnd   ?? draft.length
      // Auto-prepend "=" if the field is empty so it reads like a real formula.
      const base = draft.length === 0 ? '=' : draft
      const insertAt = draft.length === 0 ? 1 : start
      const insertEnd = draft.length === 0 ? 1 : end
      const next = base.slice(0, insertAt) + addr + base.slice(insertEnd)
      setDraft(next)
      target.commit(next)
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        const caret = insertAt + addr.length
        try { el.setSelectionRange(caret, caret) } catch {}
      })
      return true
    },
    hasTarget: () => !!target,
  }), [target, draft])

  const disabled = !target

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
      <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-primary">
        <span className="italic">f</span>x
      </span>
      <span className={cn(
        'text-[10px] uppercase tracking-wide font-semibold min-w-[150px] truncate',
        disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'
      )}>
        {target ? target.label : 'Select a calculated field or a table column to edit its formula'}
      </span>
      <Input
        ref={inputRef}
        value={disabled ? '' : draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => target && draft !== target.formula && target.commit(draft)}
        onKeyDown={e => {
          if (e.key === 'Enter' && target) target.commit(draft)
          if (e.key === 'Escape') setDraft(target?.formula || '')
        }}
        disabled={disabled}
        placeholder={disabled ? '' : '=qty * unit_cost  or  =B2*C2  or  =SUM(items.total)'}
        className="flex-1 font-mono text-xs"
      />
      {target && (
        <span className="hidden xl:inline text-[9px] text-muted-foreground italic">
          click a cell to insert its ref
        </span>
      )}
    </div>
  )
})

// ── Table toolbar (bottom, contextual) ───────────────────────────────────────

function TableToolbar({ field, selectedColumnIdx, onInsertColumn, onDeleteColumn, onDistribute, onToggleTotal }) {
  const cols = field.table_columns || []
  const hasCol = selectedColumnIdx != null
  const letter = hasCol ? columnLetter(selectedColumnIdx) : ''
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border bg-muted/40 text-xs">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-2">
        Table
        {hasCol && <span className="ml-1 text-primary font-mono">· {letter}</span>}
      </span>
      <button
        disabled={!hasCol}
        onClick={() => onInsertColumn(field, selectedColumnIdx)}
        className="px-2 py-1 rounded border border-border bg-background hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        title="Insert a new column to the LEFT of the selected one"
      >
        ◧ Insert left
      </button>
      <button
        disabled={!hasCol}
        onClick={() => onInsertColumn(field, selectedColumnIdx + 1)}
        className="px-2 py-1 rounded border border-border bg-background hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        title="Insert a new column to the RIGHT of the selected one"
      >
        ◨ Insert right
      </button>
      <button
        disabled={!hasCol || cols.length <= 1}
        onClick={() => onDeleteColumn(field, selectedColumnIdx)}
        className="px-2 py-1 rounded border border-border bg-background hover:border-destructive hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
        title="Delete the selected column"
      >
        🗑 Delete column
      </button>
      <div className="w-px h-4 bg-border" />
      <button
        onClick={() => onDistribute(field)}
        disabled={cols.length === 0}
        className="px-2 py-1 rounded border border-border bg-background hover:border-primary hover:text-primary disabled:opacity-40"
        title="Make all columns the same width"
      >
        ⇔ Distribute evenly
      </button>
      <button
        disabled={!hasCol}
        onClick={() => onToggleTotal(field, selectedColumnIdx)}
        className={cn(
          'px-2 py-1 rounded border bg-background hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed',
          hasCol && cols[selectedColumnIdx]?.show_total
            ? 'border-primary text-primary'
            : 'border-border'
        )}
        title="Toggle showing the sum of this column at the bottom"
      >
        Σ Sum at bottom
      </button>
      <div className="flex-1" />
      <span className="text-[10px] text-muted-foreground italic">
        Click a column letter to select it · drag header dividers to resize
      </span>
    </div>
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
  const [selectedColumnIdx, setSelectedColumnIdx] = useState(null)
  const [sections, setSections] = useState([DEFAULT_SECTION])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [previewUrls, setPreviewUrls] = useState({ header: null, footer: null })
  // Tab + approval + initiator state
  const [tab, setTab] = useState('fields')          // 'fields' | 'approval' | 'initiator'
  const [approvalSteps, setApprovalSteps] = useState([])
  const [initiatorRoleIds, setInitiatorRoleIds] = useState([])
  const initRef = useRef(false)
  const formulaBarRef = useRef(null)

  // Reset column selection whenever the selected field changes.
  useEffect(() => { setSelectedColumnIdx(null) }, [selectedId])

  // Click a table cell on the canvas → insert its address (e.g. "B2") at
  // the formula bar's caret. If the formula bar isn't focused on anything
  // editable, show a hint toast.
  const handleCellClick = (addr) => {
    const bar = formulaBarRef.current
    if (!bar || !bar.hasTarget()) {
      toast.message('Select a calculated field or table column first to edit its formula.')
      return
    }
    bar.insertCellRef(addr)
  }

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
      ...fromApiField(f),
      section_name: f.section_name || DEFAULT_SECTION,
    }))
    setFields(loaded)
    const found = Array.from(new Set(loaded.map(f => f.section_name)))
    setSections(found.length ? found : [DEFAULT_SECTION])
    setApprovalSteps(stepsFromApi(def.approval_template?.steps || [], roles, users))
    setInitiatorRoleIds(def.initiator_role_ids || [])
  }

  // Fetch letterhead images once the org is available so both the canvas and
  // the preview modal can display them. Re-runs when the org's image flags
  // change (e.g. user replaces the header in Settings on another tab).
  useEffect(() => {
    if (!org) return
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
    }
  }, [org?.id, org?.has_header_image, org?.has_footer_image])

  // Field operations
  const addField = (sectionName, type) => {
    const meta = FT[type]
    // System-block labels default to a human-friendly word, not "Reference No.".
    const labelDefaults = {
      reference:       'Reference',
      submission_date: 'Date',
      classification:  'Classification',
      approval_block:  'Approvals',
      text_static:     'Static Text',
    }
    const baseLabel = labelDefaults[type] || meta?.label || 'Field'
    const existingNames = fields.map(f => f.field_name)
    const tempId = `__new__${Date.now()}__${Math.random().toString(36).slice(2, 7)}`
    const newField = {
      id: tempId,                       // marked with __new__ so the server treats it as create
      field_name: ensureUnique(slugify(baseLabel), existingNames),
      field_label: baseLabel,
      field_type: type,
      section_name: sectionName || DEFAULT_SECTION,
      grid_width: meta?.defaultWidth || 'full',
      required: meta?.isSystem ? false : false,        // system blocks aren't required user input
      placeholder: '',
      options: type === 'dropdown' || type === 'radio' || type === 'checkbox' ? ['Option A', 'Option B'] : null,
      table_columns: type === 'table'
        ? [{ key: 'description', label: 'Description', type: 'text' },
           { key: 'qty', label: 'Qty', type: 'number' }]
        : null,
    }
    setFields(prev => [...prev, newField])
    setSelectedId(tempId)
  }

  // Add a field via the left toolbox — drops into the selected field's
  // section, or the last section if nothing is selected.
  const addFromToolbox = (type) => {
    const sel = fields.find(f => f.id === selectedId)
    const targetSection = sel?.section_name || sections[sections.length - 1] || DEFAULT_SECTION
    if (!sections.includes(targetSection)) {
      setSections(prev => [...prev, targetSection])
    }
    addField(targetSection, type)
  }

  // ── Table column operations (used by the bottom Table toolbar) ──────────────
  const insertColumn = (tableField, atIdx) => {
    const cols = [...(tableField.table_columns || [])]
    const newCol = { key: `col_${cols.length + 1}`, label: '', type: 'text' }
    cols.splice(atIdx, 0, newCol)
    updateField({ ...tableField, table_columns: cols })
    setSelectedColumnIdx(atIdx)
  }
  const deleteColumn = (tableField, atIdx) => {
    const cols = (tableField.table_columns || []).filter((_, i) => i !== atIdx)
    updateField({ ...tableField, table_columns: cols })
    setSelectedColumnIdx(null)
  }
  const distributeColumns = (tableField) => {
    const cols = tableField.table_columns || []
    if (cols.length === 0) return
    const w = `${(100 / cols.length).toFixed(1)}%`
    updateField({ ...tableField, table_columns: cols.map(c => ({ ...c, width: w })) })
  }
  const toggleColumnTotal = (tableField, atIdx) => {
    const cols = [...(tableField.table_columns || [])]
    if (!cols[atIdx]) return
    cols[atIdx] = { ...cols[atIdx], show_total: !cols[atIdx].show_total }
    updateField({ ...tableField, table_columns: cols })
  }

  // Reorder fields within a single section (used by the canvas DnD)
  const reorderFields = (sectionName, activeId, overId) => {
    setFields(prev => {
      const inSection = prev.filter(f => (f.section_name || DEFAULT_SECTION) === sectionName)
      const oldIdx = inSection.findIndex(f => f.id === activeId)
      const newIdx = inSection.findIndex(f => f.id === overId)
      if (oldIdx === -1 || newIdx === -1) return prev
      const reordered = arrayMove(inSection, oldIdx, newIdx)
      const result = []
      let cursor = 0
      for (const f of prev) {
        if ((f.section_name || DEFAULT_SECTION) === sectionName) {
          result.push(reordered[cursor++])
        } else {
          result.push(f)
        }
      }
      return result
    })
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
  }
  const renameSection = (oldName, newName) => {
    if (!newName.trim() || (sections.includes(newName) && newName !== oldName)) return
    setSections(prev => prev.map(s => (s === oldName ? newName : s)))
    setFields(prev => prev.map(f => ((f.section_name || DEFAULT_SECTION) === oldName ? { ...f, section_name: newName } : f)))
  }
  const deleteSection = (name) => {
    if (sections.length <= 1) return toast.error('At least one section is required.')
    const fallback = sections.find(s => s !== name)
    setSections(prev => prev.filter(s => s !== name))
    setFields(prev => prev.map(f => ((f.section_name || DEFAULT_SECTION) === name ? { ...f, section_name: fallback } : f)))
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
      const payload = ordered.map(f => {
        const api = toApiField(f)
        return {
          ...api,
          id: api.id && !String(api.id).startsWith('__new__') ? api.id : undefined,
        }
      })
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

  // Delete the entire form definition (cancels any in-flight instances).
  const deleteMut = useMutation({
    mutationFn: () => deleteFormDefinition(id),
    onSuccess: () => {
      toast.success('Form deleted.')
      qc.invalidateQueries({ queryKey: ['form-definitions'] })
      navigate('/admin/form-definitions')
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Delete failed.'),
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
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            title="Delete the entire form"
          >
            <Trash2 size={13} className="mr-1.5" /> Delete
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
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Formula bar (top) */}
          <FormulaBar
            ref={formulaBarRef}
            selectedField={selectedField}
            selectedColumnIdx={selectedColumnIdx}
            onUpdateField={updateField}
          />

          {/* Body: toolbox | canvas | properties */}
          <div className="flex-1 grid grid-cols-[200px_1fr_320px] overflow-hidden">
            {/* Toolbox */}
            <Toolbox onAdd={addFromToolbox} />

            {/* Canvas */}
            <div className="overflow-y-auto bg-muted/30 p-6">
              <FormDesignerCanvas
                formDef={formDef}
                headerUrl={previewUrls.header}
                footerUrl={previewUrls.footer}
                accent={org?.letterhead_accent}
                classification={
                  formDef.confidentiality
                    ? (org?.classification_labels || []).find(l => l.name === formDef.confidentiality) || null
                    : null
                }
                sections={sections}
                fields={fields}
                approvalSteps={approvalSteps}
                users={users}
                roles={roles}
                selectedFieldId={selectedId}
                onSelectField={setSelectedId}
                selectedColumnIdx={selectedColumnIdx}
                onSelectColumn={setSelectedColumnIdx}
                onCellClick={handleCellClick}
                onAddSection={addSection}
                onRenameSection={renameSection}
                onMoveSection={moveSection}
                onDeleteSection={deleteSection}
                onAddField={addField}
                onUpdateField={updateField}
                onDeleteField={deleteField}
                onReorderFields={reorderFields}
              />
            </div>

            {/* Properties drawer */}
            <aside className="border-l border-border bg-card overflow-y-auto p-4">
              <PropertiesPanel
                field={selectedField}
                fields={fields}
                sections={sections}
                onChange={updateField}
              />
            </aside>
          </div>

          {/* Table toolbar (bottom, contextual) */}
          {selectedField?.field_type === 'table' && (
            <TableToolbar
              field={selectedField}
              selectedColumnIdx={selectedColumnIdx}
              onInsertColumn={insertColumn}
              onDeleteColumn={deleteColumn}
              onDistribute={distributeColumns}
              onToggleTotal={toggleColumnTotal}
            />
          )}
        </div>
      )}

      {/* WYSIWYG preview modal — uses the same filler canvas employees see */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
          </DialogHeader>
          <div className="bg-muted/30 rounded-lg p-4 max-h-[75vh] overflow-y-auto">
            <FormFillerCanvas
              formDef={{ ...formDef, fields }}
              headerUrl={previewUrls.header}
              footerUrl={previewUrls.footer}
              accent={org?.letterhead_accent}
              classification={
                formDef.confidentiality
                  ? (org?.classification_labels || []).find(l => l.name === formDef.confidentiality) || null
                  : null
              }
              user={null}
              users={users}
              roles={roles}
              approvalSteps={approvalSteps}
              referenceNumber={null}
              fieldValues={{}}
              onFieldChange={() => {}}
              pendingFiles={{}}
              onFilesChange={() => {}}
              disabled
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete form confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete this form?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              You're about to delete <strong>{formDef.printed_title || formDef.name}</strong> permanently.
            </p>
            <p className="text-muted-foreground">
              Any forms currently under review will be cancelled. This cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleteMut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
