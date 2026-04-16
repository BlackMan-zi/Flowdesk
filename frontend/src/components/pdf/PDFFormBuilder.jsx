import React, { useState, useRef, useEffect, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { toast } from 'sonner'
import PDFPageCanvas from './PDFPageCanvas'
import { uploadPdfTemplate, getPdfTemplateBlob } from '../../api/forms'
import Button from '../ui/Button'
import { cn } from '../../lib/utils'
import {
  Type, Hash, Calendar, AlignLeft, ChevronDown, CheckSquare,
  PenTool, ChevronLeft, ChevronRight, Upload, Trash2, Save, X,
  DollarSign, Zap, Table2, Circle, Plus, HelpCircle,
  Paperclip, Search, ChevronUp, ToggleLeft, Workflow,
  ZoomIn, ZoomOut, Maximize2, SlidersHorizontal, FileDigit,
  FilePlus, FileX
} from 'lucide-react'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

// ── Field type definitions ────────────────────────────────────────────────────

const FIELD_TYPES = [
  { type: 'text',       label: 'Text Input',      icon: Type,        group: 'input'     },
  { type: 'textarea',   label: 'Paragraph',        icon: AlignLeft,   group: 'input'     },
  { type: 'number',     label: 'Number',           icon: Hash,        group: 'input'     },
  { type: 'currency',   label: 'Currency',         icon: DollarSign,  group: 'input'     },
  { type: 'date',       label: 'Date',             icon: Calendar,    group: 'input'     },
  { type: 'dropdown',   label: 'Dropdown',         icon: ChevronDown, group: 'selection' },
  { type: 'radio',      label: 'Radio Buttons',    icon: Circle,      group: 'selection' },
  { type: 'checkbox',   label: 'Checkbox',         icon: CheckSquare, group: 'selection' },
  { type: 'calculated', label: 'Calculated',       icon: Zap,         group: 'advanced'  },
  { type: 'table',      label: 'Table / Grid',     icon: Table2,      group: 'advanced'  },
  { type: 'reference',  label: 'Reference No.',    icon: FileDigit,   group: 'advanced'  },
  { type: 'file',       label: 'Attachment',       icon: Paperclip,   group: 'advanced'  },
  { type: 'signature',  label: 'Signature',        icon: PenTool,     group: 'advanced'  },
]

const FIELD_GROUPS = [
  { id: 'input',     label: 'Input Fields',       icon: Type,       types: ['text','textarea','number','currency','date'] },
  { id: 'selection', label: 'Selection Controls', icon: ToggleLeft, types: ['dropdown','radio','checkbox'] },
  { id: 'advanced',  label: 'Data & Advanced',    icon: Zap,        types: ['calculated','table','reference','file','signature'] },
]

// ── Filled-by role config ─────────────────────────────────────────────────────

const FILLED_BY_OPTIONS = [
  { value: 'initiator',    label: 'Initiator',       color: 'border-blue-500   bg-blue-50/80   text-blue-800',   pill: 'bg-blue-100 text-blue-700 border-blue-200'   },
  { value: 'line_manager', label: 'Line Manager',    color: 'border-violet-500 bg-violet-50/80 text-violet-800', pill: 'bg-violet-100 text-violet-700 border-violet-200' },
  { value: 'sn_manager',   label: 'Sr. Manager',     color: 'border-indigo-500 bg-indigo-50/80 text-indigo-800', pill: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'hod',          label: 'Head of Dept',    color: 'border-amber-500  bg-amber-50/80  text-amber-800',  pill: 'bg-amber-100 text-amber-700 border-amber-200'  },
  { value: 'any',          label: 'Any / Shared',    color: 'border-slate-400  bg-slate-50/80  text-slate-700',  pill: 'bg-slate-100 text-slate-600 border-slate-200'  },
]

const filledByColor = (v) => FILLED_BY_OPTIONS.find(o => o.value === v)?.color || FILLED_BY_OPTIONS[0].color
const filledByPill  = (v) => FILLED_BY_OPTIONS.find(o => o.value === v)?.pill  || FILLED_BY_OPTIONS[0].pill
const filledByLabel = (v) => FILLED_BY_OPTIONS.find(o => o.value === v)?.label || 'Initiator'

const typeIcon = (type) => {
  const cfg = FIELD_TYPES.find(t => t.type === type)
  if (!cfg) return null
  const Icon = cfg.icon
  return <Icon size={11} />
}

// ── Tag input ─────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState('')
  const addTag = (v) => {
    const t = v.trim()
    if (t && !tags.includes(t)) onChange([...tags, t])
    setInput('')
  }
  return (
    <div className="border border-slate-300 rounded p-1.5 flex flex-wrap gap-1 focus-within:ring-1 focus-within:ring-brand-500 bg-white">
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-1 bg-brand-100 text-brand-800 text-xs px-1.5 py-0.5 rounded">
          {t}
          <button type="button" onClick={() => onChange(tags.filter(x => x !== t))}><X size={9} /></button>
        </span>
      ))}
      <input
        type="text" value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); addTag(input) }
          if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1))
        }}
        onBlur={() => { if (input.trim()) addTag(input) }}
        placeholder={tags.length ? '' : placeholder}
        className="flex-1 min-w-[80px] text-xs outline-none bg-transparent py-0.5"
      />
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex ml-1 align-middle"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <HelpCircle size={11} className="text-slate-400 cursor-help" />
      {show && (
        <span className="absolute z-50 bottom-5 left-0 w-52 bg-slate-800 text-white text-xs rounded p-2 shadow-lg leading-relaxed whitespace-normal">
          {text}
        </span>
      )}
    </span>
  )
}

// ── Table column manager ──────────────────────────────────────────────────────

function TableColumnManager({ columns, onChange }) {
  const cols = columns || []
  const add = () => onChange([...cols, { key: `col${cols.length+1}`, label: `Column ${cols.length+1}`, type: 'text', formula: '' }])
  const remove = (i) => onChange(cols.filter((_, idx) => idx !== i))
  const upd = (i, p) => onChange(cols.map((c, idx) => idx === i ? { ...c, ...p } : c))
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">Table Columns</span>
        <button onClick={add} className="text-brand-600 hover:text-brand-800 flex items-center gap-0.5 text-xs"><Plus size={11} /> Add</button>
      </div>
      {cols.map((col, i) => (
        <div key={i} className="bg-slate-50 border border-slate-200 rounded p-2 space-y-1">
          <div className="flex gap-1">
            <input type="text" value={col.label} onChange={e => upd(i, { label: e.target.value })} placeholder="Label"
              className="flex-1 text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none" />
            <input type="text" value={col.key} onChange={e => upd(i, { key: e.target.value.toLowerCase().replace(/\s+/g,'_') })} placeholder="key"
              className="w-20 text-xs border border-slate-200 rounded px-1.5 py-1 font-mono focus:outline-none" />
            <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 px-1"><X size={12} /></button>
          </div>
          <div className="flex gap-1">
            <select value={col.type} onChange={e => upd(i, { type: e.target.value })}
              className="flex-1 text-xs border border-slate-200 rounded px-1.5 py-1">
              <option value="text">Text</option><option value="number">Number</option>
              <option value="currency">Currency</option><option value="date">Date</option>
              <option value="calculated">Calculated</option>
            </select>
            {col.type === 'calculated' && (
              <input type="text" value={col.formula||''} onChange={e => upd(i, { formula: e.target.value })} placeholder="qty * price"
                className="flex-1 text-xs border border-slate-200 rounded px-1.5 py-1 font-mono focus:outline-none" />
            )}
          </div>
        </div>
      ))}
      {cols.length === 0 && <p className="text-xs text-slate-400 italic">No columns yet</p>}
    </div>
  )
}

// ── Field properties panel ────────────────────────────────────────────────────

function FieldProperties({ field, onChange, onDelete, formCodeSuffix }) {
  if (!field) return (
    <div className="text-xs text-slate-400 text-center py-8 px-3 flex flex-col items-center gap-2">
      <SlidersHorizontal size={20} className="text-slate-300" />
      <span>Click a field on the PDF to edit its properties</span>
    </div>
  )

  const rules = field.validation_rules || {}
  const setRule = (key, val) => onChange({ validation_rules: { ...rules, [key]: val || undefined } })
  const hasOptions = ['dropdown', 'checkbox', 'radio'].includes(field.field_type)
  const isReference = field.field_type === 'reference'

  return (
    <div className="p-3 space-y-3 text-xs overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Properties</p>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-0.5 rounded hover:bg-red-50">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Role badge preview */}
      <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium w-fit', filledByPill(field.filled_by || 'initiator'))}>
        <Workflow size={9} />
        {filledByLabel(field.filled_by || 'initiator')}
      </div>

      {/* Label */}
      <label className="block">
        <span className="font-medium text-slate-600 block mb-1">Label <Tip text="Shown to the person filling the form." /></span>
        <input type="text" value={field.field_label} onChange={e => onChange({ field_label: e.target.value })}
          className="w-full border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </label>

      {/* Field name */}
      <label className="block">
        <span className="font-medium text-slate-600 block mb-1">Field name <Tip text="Internal key used in formulas. Lowercase with underscores." /></span>
        <input type="text" value={field.field_name}
          onChange={e => onChange({ field_name: e.target.value.toLowerCase().replace(/\s+/g,'_') })}
          className="w-full border border-slate-300 rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </label>

      {/* Type */}
      <label className="block">
        <span className="font-medium text-slate-600 block mb-1">Type</span>
        <select value={field.field_type} onChange={e => onChange({ field_type: e.target.value })}
          className="w-full border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500">
          {FIELD_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
      </label>

      {/* Reference number config */}
      {isReference && (
        <div className="space-y-2 p-2 bg-amber-50 border border-amber-200 rounded">
          <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
            <FileDigit size={11} /> Reference Number Settings
          </p>
          <label className="block">
            <span className="text-slate-600 block mb-0.5">Prefix <Tip text="Prepended to the number. Defaults to the form's code suffix (e.g. LEAVE → LEAVE-0001)." /></span>
            <input type="text" value={rules.ref_prefix ?? formCodeSuffix ?? ''}
              onChange={e => setRule('ref_prefix', e.target.value.toUpperCase())}
              placeholder={formCodeSuffix || 'PREFIX'}
              className="w-full border border-slate-200 rounded px-2 py-1 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-brand-400" />
          </label>
          <label className="block">
            <span className="text-slate-600 block mb-0.5">Digit padding</span>
            <select value={rules.ref_padding ?? 4} onChange={e => setRule('ref_padding', Number(e.target.value))}
              className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none">
              <option value={3}>3 digits — PR-001</option>
              <option value={4}>4 digits — PR-0001</option>
              <option value={5}>5 digits — PR-00001</option>
              <option value={6}>6 digits — PR-000001</option>
            </select>
          </label>
          <p className="text-xs text-amber-700 bg-amber-100 rounded px-2 py-1">
            Preview: <strong>{(rules.ref_prefix || formCodeSuffix || 'REF')}-{'0'.repeat((rules.ref_padding || 4) - 1)}1</strong>
          </p>
          <p className="text-xs text-slate-500">Auto-generated on submission. Read-only for users.</p>
        </div>
      )}

      {/* Filled by (not relevant for reference) */}
      {!isReference && (
        <label className="block">
          <span className="font-medium text-slate-600 block mb-1">
            Filled by <Tip text="Defines which role fills this field. Drives color-coding and workflow routing." />
          </span>
          <select value={field.filled_by || 'initiator'} onChange={e => onChange({ filled_by: e.target.value })}
            className="w-full border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500">
            {FILLED_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}

      {/* Options */}
      {hasOptions && (
        <label className="block">
          <span className="font-medium text-slate-600 block mb-1">Options <Tip text="Press Enter after each option." /></span>
          <TagInput tags={Array.isArray(field.options) ? field.options : []} onChange={opts => onChange({ options: opts })} placeholder="Type option, press Enter…" />
        </label>
      )}

      {/* Attachment config */}
      {field.field_type === 'file' && (
        <div className="space-y-2 p-2 bg-slate-50 border border-slate-200 rounded">
          <p className="text-xs font-medium text-slate-600 flex items-center gap-1.5"><Paperclip size={11} /> Attachment Settings</p>
          <label className="block">
            <span className="text-slate-500 block mb-0.5">Accepted formats</span>
            <input type="text" value={rules.accept||''} onChange={e => setRule('accept', e.target.value)}
              placeholder=".pdf,.docx,.xlsx,.jpg,.png,.zip"
              className="w-full border border-slate-200 rounded px-2 py-1 font-mono text-xs focus:outline-none" />
          </label>
          <label className="block">
            <span className="text-slate-500 block mb-0.5">Max size (MB)</span>
            <input type="number" value={rules.max_size_mb??''} onChange={e => setRule('max_size_mb', e.target.value ? Number(e.target.value) : '')}
              placeholder="10" className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none" />
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={rules.multiple||false} onChange={e => setRule('multiple', e.target.checked)} className="rounded" />
            <span>Allow multiple files</span>
          </label>
        </div>
      )}

      {/* Formula */}
      {field.field_type === 'calculated' && (
        <label className="block">
          <span className="font-medium text-slate-600 block mb-1">Formula <Tip text="Use field_name tokens. E.g.: qty * unit_price or SUM(items.amount)" /></span>
          <input type="text" value={field.calculation_formula||''} onChange={e => onChange({ calculation_formula: e.target.value })}
            placeholder="e.g. qty * unit_price"
            className="w-full border border-slate-300 rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </label>
      )}

      {/* Table columns */}
      {field.field_type === 'table' && (
        <TableColumnManager columns={field.table_columns} onChange={cols => onChange({ table_columns: cols })} />
      )}

      {/* Default value */}
      {!['signature','table','file','reference'].includes(field.field_type) && (
        <label className="block">
          <span className="font-medium text-slate-600 block mb-1">Default value</span>
          <input type="text" value={field.default_value||''} onChange={e => onChange({ default_value: e.target.value||null })}
            placeholder="Pre-filled value…"
            className="w-full border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </label>
      )}

      {/* Validation */}
      {['text','textarea','number','currency'].includes(field.field_type) && (
        <div className="space-y-1.5">
          <span className="font-medium text-slate-600 flex items-center">Validation <Tip text="Min/max restrict numeric range. Min/max length restrict text length." /></span>
          {['number','currency'].includes(field.field_type) && (
            <div className="flex gap-1.5">
              <label className="flex-1"><span className="text-slate-500 block mb-0.5">Min</span>
                <input type="number" value={rules.min??''} onChange={e => setRule('min', e.target.value ? Number(e.target.value):'')}
                  className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none" /></label>
              <label className="flex-1"><span className="text-slate-500 block mb-0.5">Max</span>
                <input type="number" value={rules.max??''} onChange={e => setRule('max', e.target.value ? Number(e.target.value):'')}
                  className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none" /></label>
            </div>
          )}
          {['text','textarea'].includes(field.field_type) && (
            <div className="flex gap-1.5">
              <label className="flex-1"><span className="text-slate-500 block mb-0.5">Min length</span>
                <input type="number" value={rules.min_length??''} onChange={e => setRule('min_length', e.target.value ? Number(e.target.value):'')}
                  className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none" /></label>
              <label className="flex-1"><span className="text-slate-500 block mb-0.5">Max length</span>
                <input type="number" value={rules.max_length??''} onChange={e => setRule('max_length', e.target.value ? Number(e.target.value):'')}
                  className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none" /></label>
            </div>
          )}
          <label className="block">
            <span className="text-slate-500 flex items-center mb-0.5">Pattern (regex) <Tip text="E.g. '^[A-Z]{2}-\d{4}$'" /></span>
            <input type="text" value={rules.pattern??''} onChange={e => setRule('pattern', e.target.value)}
              placeholder="^[A-Z]{3}-\d+$"
              className="w-full border border-slate-200 rounded px-2 py-1 font-mono focus:outline-none" />
          </label>
        </div>
      )}

      {/* Toggles */}
      {!isReference && (
        <div className="space-y-1.5 border-t border-slate-100 pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={field.required} onChange={e => onChange({ required: e.target.checked })} className="rounded" />
            <span>Required <span className="text-red-500">*</span></span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={field.read_only||false} onChange={e => onChange({ read_only: e.target.checked })} className="rounded" />
            <span>Read-only</span>
          </label>
        </div>
      )}

      {/* Position info */}
      <div className="text-slate-400 border-t border-slate-100 pt-2 space-y-0.5">
        <p>Page {field.page_number} · X: {field.x_pct?.toFixed(1)}% Y: {field.y_pct?.toFixed(1)}%</p>
        <p>W: {field.width_pct?.toFixed(1)}% H: {field.height_pct?.toFixed(1)}%</p>
      </div>
    </div>
  )
}

// ── Grouped field toolbox ─────────────────────────────────────────────────────

function FieldToolbox({ pendingType, onSelect }) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matchesSearch = (ft) => !tokens.length || tokens.every(t => ft.label.toLowerCase().includes(t) || ft.type.includes(t))
  const filteredTypes = FIELD_TYPES.filter(matchesSearch)
  const isSearching = tokens.length > 0
  const toggle = (id) => setCollapsed(p => ({ ...p, [id]: !p[id] }))

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 pb-2 border-b border-slate-100 flex-shrink-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Add Field</p>
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search field types…"
            className="w-full pl-6 pr-6 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white" />
          {search && <button onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={10} /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="p-2 space-y-0.5">
            {filteredTypes.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No field types match</p>
            ) : filteredTypes.map(ft => <FTBtn key={ft.type} ft={ft} pendingType={pendingType} onSelect={onSelect} />)}
          </div>
        ) : FIELD_GROUPS.map(group => {
          const groupTypes = FIELD_TYPES.filter(ft => ft.group === group.id)
          const isOpen = !collapsed[group.id]
          const GroupIcon = group.icon
          return (
            <div key={group.id} className="border-b border-slate-100 last:border-0">
              <button onClick={() => toggle(group.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                <span className="flex items-center gap-1.5"><GroupIcon size={11} className="text-slate-400" />{group.label}</span>
                {isOpen ? <ChevronUp size={11} className="text-slate-400" /> : <ChevronDown size={11} className="text-slate-400" />}
              </button>
              {isOpen && (
                <div className="px-2 pb-2 space-y-0.5">
                  {groupTypes.map(ft => <FTBtn key={ft.type} ft={ft} pendingType={pendingType} onSelect={onSelect} />)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {pendingType && (
        <div className="px-3 py-2 border-t border-slate-100 bg-brand-50 flex-shrink-0">
          <p className="text-xs text-brand-700 font-medium flex items-center gap-1.5 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 inline-block" />
            Draw a box on the PDF →
          </p>
          <button onClick={() => onSelect(null)} className="text-xs text-slate-500 hover:text-slate-700 mt-0.5">Cancel</button>
        </div>
      )}
    </div>
  )
}

function FTBtn({ ft, pendingType, onSelect }) {
  const active = pendingType === ft.type
  const Icon = ft.icon
  return (
    <button
      onClick={() => onSelect(active ? null : ft.type)}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors',
        active ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
      )}
    >
      <Icon size={12} className="flex-shrink-0" />
      <span className="flex-1">{ft.label}</span>
      {ft.type === 'reference' && !active && <span className="text-[9px] text-slate-400 border border-slate-200 px-1 rounded">auto</span>}
      {active && <span className="text-brand-200">✓</span>}
    </button>
  )
}

// ── Page navigation bar ───────────────────────────────────────────────────────

function PageNav({ numPages, currentPage, onChangePage, fields, onAddPage, onDeletePage }) {
  return (
    <div className="flex-shrink-0 border-b border-slate-200 bg-white">
      <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-2 flex-shrink-0">Pages</span>
        {Array.from({ length: numPages }, (_, i) => i + 1).map(page => {
          const count = fields.filter(f => f.page_number === page).length
          const isActive = page === currentPage
          return (
            <button
              key={page}
              onClick={() => onChangePage(page)}
              className={cn(
                'flex-shrink-0 flex flex-col items-center justify-center rounded-lg border-2 px-2.5 py-1.5 transition-all text-xs',
                isActive
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <span className="font-semibold">{page}</span>
              <span className={cn('text-[9px]', isActive ? 'text-brand-500' : 'text-slate-400')}>
                {count} field{count !== 1 ? 's' : ''}
              </span>
            </button>
          )
        })}
        {/* Add page */}
        <button
          onClick={onAddPage}
          title="Add virtual page"
          className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-500 transition-colors"
        >
          <Plus size={14} />
        </button>
        {/* Delete last page (only if it's a virtual page beyond PDF) */}
        {onDeletePage && numPages > 1 && (
          <button
            onClick={onDeletePage}
            title="Remove last page"
            className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <FileX size={13} />
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400 flex-shrink-0">
          {fields.length} field{fields.length !== 1 ? 's' : ''} total
        </span>
      </div>
    </div>
  )
}

// ── Zoom controls ─────────────────────────────────────────────────────────────

const ZOOM_STEPS = [50, 75, 90, 100, 110, 125, 150, 175, 200]

function ZoomControl({ zoom, onZoom }) {
  const step = (dir) => {
    const idx = ZOOM_STEPS.findIndex(z => z >= zoom)
    const next = dir > 0
      ? ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, idx + 1)]
      : ZOOM_STEPS[Math.max(0, idx - 1)]
    onZoom(next)
  }
  return (
    <div className="flex items-center gap-1 border border-slate-200 rounded-md overflow-hidden">
      <button onClick={() => step(-1)} disabled={zoom <= 50}
        className="p-1.5 hover:bg-slate-50 disabled:opacity-30 transition-colors" title="Zoom out">
        <ZoomOut size={13} />
      </button>
      <select value={zoom} onChange={e => onZoom(Number(e.target.value))}
        className="text-xs px-1 py-1 bg-transparent focus:outline-none cursor-pointer">
        {ZOOM_STEPS.map(z => <option key={z} value={z}>{z}%</option>)}
      </select>
      <button onClick={() => step(1)} disabled={zoom >= 200}
        className="p-1.5 hover:bg-slate-50 disabled:opacity-30 transition-colors" title="Zoom in">
        <ZoomIn size={13} />
      </button>
      <button onClick={() => onZoom(100)} className="p-1.5 hover:bg-slate-50 transition-colors border-l border-slate-200" title="Reset zoom">
        <Maximize2 size={12} />
      </button>
    </div>
  )
}

// ── Main builder ──────────────────────────────────────────────────────────────

export default function PDFFormBuilder({ formDef, initialFields = [], onSave, onBack, onDelete }) {
  const [pdfDoc, setPdfDoc]         = useState(null)
  const [pdfPageCount, setPdfPageCount] = useState(0)   // pages in the PDF
  const [numPages, setNumPages]     = useState(1)        // total form pages (PDF + virtual)
  const [currentPage, setCurrentPage] = useState(1)
  const [fields, setFields]         = useState(initialFields)
  const [selectedId, setSelectedId] = useState(null)
  const [pendingType, setPendingType] = useState(null)
  const [saving, setSaving]         = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [showRoleBadges, setShowRoleBadges] = useState(true)
  const [zoom, setZoom]             = useState(100)

  const [drawDrag, setDrawDrag]     = useState(null)
  const [moveDrag, setMoveDrag]     = useState(null)
  const [resizeDrag, setResizeDrag] = useState(null)

  // Two refs: outer scroll container to measure available width, inner canvas
  const scrollContainerRef = useRef(null)
  const canvasRef           = useRef(null)
  const fileInputRef        = useRef(null)
  const [availableWidth, setAvailableWidth] = useState(0)

  // Measure outer scroll container width
  useEffect(() => {
    if (!scrollContainerRef.current) return
    const obs = new ResizeObserver(entries => setAvailableWidth(entries[0].contentRect.width))
    obs.observe(scrollContainerRef.current)
    return () => obs.disconnect()
  }, [])

  // Base canvas width = available scroll area (minus outer p-6 padding + 8px canvas margin) capped at 850
  const BASE_MAX = 850
  const basePdfWidth = availableWidth ? Math.min(availableWidth - 64, BASE_MAX) : BASE_MAX
  const pdfWidth = Math.round(basePdfWidth * zoom / 100)

  // Load PDF
  useEffect(() => {
    if (!formDef?.pdf_template_path) return
    let blobUrl = null
    getPdfTemplateBlob(formDef.id).then(async res => {
      blobUrl = URL.createObjectURL(res.data)
      const doc = await pdfjsLib.getDocument(blobUrl).promise
      setPdfDoc(doc)
      setPdfPageCount(doc.numPages)
      setNumPages(prev => Math.max(prev, doc.numPages))
    }).catch(() => {})
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [formDef?.id])

  // Sync numPages from initial fields (fields may reference pages beyond PDF)
  useEffect(() => {
    if (!initialFields.length) return
    const maxPage = Math.max(...initialFields.map(f => f.page_number || 1))
    setNumPages(prev => Math.max(prev, maxPage))
  }, [])

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadPdfTemplate(formDef.id, file)
      const url = URL.createObjectURL(file)
      const doc = await pdfjsLib.getDocument(url).promise
      setPdfDoc(doc)
      setPdfPageCount(doc.numPages)
      setNumPages(prev => Math.max(prev, doc.numPages))
      setCurrentPage(1)
      toast.success('PDF template uploaded')
    } catch {
      toast.error('PDF upload failed')
    }
    setUploading(false)
  }

  // ── Save: map 'reference' type → text + auto_fill flags for backend ──────────
  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = fields.map((f, idx) => {
        const isRef = f.field_type === 'reference'
        return {
          ...(f._isNew ? {} : { id: f.id }),
          field_name:          f.field_name || `field_${idx + 1}`,
          field_label:         f.field_label || `Field ${idx + 1}`,
          field_type:          isRef ? 'text' : f.field_type,  // backend enum has no 'reference'
          required:            isRef ? false : f.required,
          auto_filled:         isRef ? true : (f.auto_filled || false),
          auto_fill_source:    isRef ? 'reference_number' : (f.auto_fill_source || null),
          options:             f.options || null,
          placeholder:         isRef ? (f.validation_rules?.ref_prefix || formDef?.code_suffix || 'REF') + '-' + '0'.repeat((f.validation_rules?.ref_padding || 4) - 1) + '1' : (f.placeholder || null),
          display_order:       idx,
          page_number:         f.page_number,
          x_pct:               f.x_pct,
          y_pct:               f.y_pct,
          width_pct:           f.width_pct,
          height_pct:          f.height_pct,
          default_value:       f.default_value || null,
          read_only:           isRef ? true : (f.read_only || false),
          validation_rules:    f.validation_rules || null,
          calculation_formula: f.calculation_formula || null,
          table_columns:       f.table_columns || null,
          filled_by:           f.filled_by || 'initiator',
        }
      })
      await onSave(payload)
      toast.success('Layout saved')
    } catch {
      toast.error('Save failed — please try again')
    } finally {
      setSaving(false)
    }
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────────
  const getRelativePos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.min(100, Math.max(0, (e.clientX - rect.left) / rect.width * 100)),
      y: Math.min(100, Math.max(0, (e.clientY - rect.top) / rect.height * 100)),
    }
  }, [])

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    if (pendingType) {
      e.preventDefault()
      const { x, y } = getRelativePos(e)
      setDrawDrag({ startX: x, startY: y, currentX: x, currentY: y })
      return
    }
    setSelectedId(null)
  }, [pendingType, getRelativePos])

  const startFieldMove = useCallback((e, fieldId) => {
    e.stopPropagation()
    if (pendingType) return
    e.preventDefault()
    const { x, y } = getRelativePos(e)
    const field = fields.find(f => f.id === fieldId)
    if (!field) return
    setSelectedId(fieldId)
    setMoveDrag({ fieldId, startX: x, startY: y, origX: field.x_pct, origY: field.y_pct })
  }, [pendingType, fields, getRelativePos])

  const startFieldResize = useCallback((e, fieldId) => {
    e.preventDefault(); e.stopPropagation()
    const { x, y } = getRelativePos(e)
    const field = fields.find(f => f.id === fieldId)
    if (!field) return
    setResizeDrag({ fieldId, startX: x, startY: y, origX: field.x_pct, origY: field.y_pct, origW: field.width_pct, origH: field.height_pct })
  }, [fields, getRelativePos])

  const handleMouseMove = useCallback((e) => {
    const { x, y } = getRelativePos(e)
    if (drawDrag) { setDrawDrag(d => d ? { ...d, currentX: x, currentY: y } : null); return }
    if (moveDrag) {
      const dx = x - moveDrag.startX; const dy = y - moveDrag.startY
      setFields(fs => fs.map(f => f.id === moveDrag.fieldId ? {
        ...f,
        x_pct: Math.min(100 - f.width_pct, Math.max(0, moveDrag.origX + dx)),
        y_pct: Math.min(100 - f.height_pct, Math.max(0, moveDrag.origY + dy)),
      } : f)); return
    }
    if (resizeDrag) {
      const dw = x - resizeDrag.startX; const dh = y - resizeDrag.startY
      setFields(fs => fs.map(f => f.id === resizeDrag.fieldId ? {
        ...f,
        width_pct:  Math.max(2, resizeDrag.origW + dw),
        height_pct: Math.max(1, resizeDrag.origH + dh),
      } : f))
    }
  }, [drawDrag, moveDrag, resizeDrag, getRelativePos])

  const handleMouseUp = useCallback((e) => {
    if (drawDrag && pendingType) {
      const { x, y } = getRelativePos(e)
      const x0 = Math.min(drawDrag.startX, x)
      const y0 = Math.min(drawDrag.startY, y)
      const w  = Math.abs(x - drawDrag.startX)
      const h  = Math.abs(y - drawDrag.startY)
      if (w >= 1 && h >= 0.5) {
        const tempId = `new_${Date.now()}`
        const fieldCount = fields.filter(f => f.page_number === currentPage).length
        const ft = FIELD_TYPES.find(t => t.type === pendingType)
        const isRef = pendingType === 'reference'
        setFields(fs => [...fs, {
          id: tempId, _isNew: true,
          field_name:  isRef ? 'reference_number' : `field_${fields.length + 1}`,
          field_label: isRef ? 'Reference No.' : `${ft?.label || 'Field'} ${fieldCount + 1}`,
          field_type:  pendingType,
          required: !isRef,
          options: null, placeholder: null,
          default_value: null, read_only: isRef,
          validation_rules: isRef ? { ref_prefix: formDef?.code_suffix || '', ref_padding: 4 } : null,
          calculation_formula: null, table_columns: pendingType === 'table'
            ? [{ key: 'col1', label: 'Column 1', type: 'text', formula: '' }] : null,
          filled_by: 'initiator',
          page_number: currentPage,
          x_pct: x0, y_pct: y0, width_pct: w, height_pct: h,
        }])
        setSelectedId(tempId)
        setPendingType(null)
      }
    }
    setDrawDrag(null); setMoveDrag(null); setResizeDrag(null)
  }, [drawDrag, pendingType, fields, currentPage, getRelativePos, formDef])

  const updateField = (id, changes) => setFields(fs => fs.map(f => f.id === id ? { ...f, ...changes } : f))
  const deleteField = (id) => { setFields(fs => fs.filter(f => f.id !== id)); setSelectedId(null) }

  const addPage = () => setNumPages(p => p + 1)
  const deletePage = () => {
    if (numPages <= 1) return
    const lastPage = numPages
    setFields(fs => fs.filter(f => f.page_number !== lastPage))
    setNumPages(p => p - 1)
    if (currentPage === lastPage) setCurrentPage(lastPage - 1)
  }

  const selectedField = fields.find(f => f.id === selectedId) || null
  const pageFields    = fields.filter(f => f.page_number === currentPage)

  // Only allow deleting pages beyond what PDF has
  const canDeletePage = numPages > 1 && (pdfPageCount === 0 || currentPage > pdfPageCount)

  const previewRect = drawDrag ? {
    left:   `${Math.min(drawDrag.startX, drawDrag.currentX)}%`,
    top:    `${Math.min(drawDrag.startY, drawDrag.currentY)}%`,
    width:  `${Math.abs(drawDrag.currentX - drawDrag.startX)}%`,
    height: `${Math.abs(drawDrag.currentY - drawDrag.startY)}%`,
  } : null

  return (
    <div className="flex flex-col h-screen bg-slate-100" style={{ userSelect: 'none' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0">
          <ChevronLeft size={16} /> Back
        </button>
        <div className="w-px h-5 bg-slate-200 flex-shrink-0" />
        <p className="text-sm font-semibold text-slate-800 truncate flex-1 min-w-0">{formDef?.name} — Layout Designer</p>

        {/* Zoom */}
        <ZoomControl zoom={zoom} onZoom={setZoom} />

        {/* Role badge toggle */}
        <button
          onClick={() => setShowRoleBadges(p => !p)}
          className={cn(
            'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors flex-shrink-0',
            showRoleBadges ? 'bg-brand-50 text-brand-700 border-brand-200' : 'text-slate-500 border-slate-200 hover:bg-slate-50'
          )}
        >
          <Workflow size={12} /> Role badges
        </button>

        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handlePdfUpload} />
        <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} loading={uploading} className="flex-shrink-0">
          <Upload size={13} className="mr-1.5" /> {formDef?.pdf_template_path ? 'Replace PDF' : 'Upload PDF'}
        </Button>
        <Button size="sm" onClick={handleSave} loading={saving} disabled={!pdfDoc} className="flex-shrink-0">
          <Save size={13} className="mr-1.5" /> Save & Return
        </Button>
        {onDelete && (
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-red-500 hover:text-red-700 flex-shrink-0">
            <Trash2 size={13} className="mr-1.5" /> Delete Form
          </Button>
        )}
      </div>

      {/* ── Page navigation bar ── */}
      <PageNav
        numPages={numPages}
        currentPage={currentPage}
        onChangePage={setCurrentPage}
        fields={fields}
        onAddPage={addPage}
        onDeletePage={canDeletePage ? deletePage : null}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left panel ── */}
        <div className="w-56 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          {/* Toolbox */}
          <div className="border-b border-slate-200 overflow-y-auto" style={{ maxHeight: '55%' }}>
            <FieldToolbox pendingType={pendingType} onSelect={setPendingType} />
          </div>

          {/* Field list + properties */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {pageFields.length > 0 && (
              <div className="p-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-1">
                  Page {currentPage} · {pageFields.length} field{pageFields.length !== 1 ? 's' : ''}
                </p>
                {pageFields.map(f => (
                  <button key={f.id} onClick={() => setSelectedId(f.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors',
                      selectedId === f.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50 text-slate-600'
                    )}>
                    {typeIcon(f.field_type)}
                    <span className="flex-1 truncate">{f.field_label}</span>
                    {f.required && <span className="text-red-400 font-bold">*</span>}
                  </button>
                ))}
              </div>
            )}
            <FieldProperties
              field={selectedField}
              onChange={changes => updateField(selectedId, changes)}
              onDelete={() => deleteField(selectedId)}
              formCodeSuffix={formDef?.code_suffix}
            />
          </div>
        </div>

        {/* ── PDF canvas ── */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto bg-slate-200 flex justify-center p-6"
        >
          {!pdfDoc ? (
            <div className="flex flex-col items-center justify-center gap-4 text-center self-center">
              <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow">
                <Upload size={24} className="text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">No PDF template yet</p>
                <p className="text-xs text-slate-400 mt-1">Upload a PDF to start placing fields</p>
              </div>
              <Button onClick={() => fileInputRef.current?.click()} loading={uploading}>
                <Upload size={14} className="mr-1.5" /> Upload PDF Template
              </Button>
              {/* Allow placing fields on virtual page even without PDF */}
              <p className="text-xs text-slate-400">or use the blank canvas below</p>
            </div>
          ) : null}

          {/* Canvas — shown always when PDF exists, or as blank canvas */}
          {/* White margin wrapper ensures edge content is never flush against the shadow/border */}
          {(pdfDoc || true) && (
            <div className="shadow-xl self-start rounded-sm" style={{ background: 'white', padding: '8px' }}>
              <div
                ref={canvasRef}
                style={{
                  position: 'relative',
                  width: pdfWidth,
                  minHeight: pdfDoc ? undefined : 1122,  // A4 aspect ratio at ~794px width
                  cursor: pendingType ? 'crosshair' : (moveDrag ? 'grabbing' : 'default'),
                  backgroundColor: pdfDoc ? 'transparent' : 'white',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                  if (drawDrag) setDrawDrag(null)
                  if (moveDrag) setMoveDrag(null)
                  if (resizeDrag) setResizeDrag(null)
                }}
              >
                {pdfDoc && currentPage <= pdfPageCount && (
                  <PDFPageCanvas
                    pdfDoc={pdfDoc}
                    pageNum={currentPage}
                    containerWidth={pdfWidth}
                  />
                )}

                {/* Blank page grid for virtual pages */}
                {(!pdfDoc || currentPage > pdfPageCount) && (
                  <div
                    style={{ width: pdfWidth, minHeight: Math.round(pdfWidth * 1.414) }}
                    className="bg-white"
                  >
                    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.15 }}>
                      <defs>
                        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className="text-slate-200 text-sm font-medium">Page {currentPage}</p>
                    </div>
                  </div>
                )}

                {/* Field overlays */}
                {pageFields.map(f => {
                  const isSelected = selectedId === f.id
                  const isRef = f.field_type === 'reference'
                  const colorCls = isRef
                    ? 'border-amber-500 bg-amber-50/80 text-amber-800'
                    : filledByColor(f.filled_by || 'initiator')
                  return (
                    <div
                      key={f.id}
                      style={{
                        position: 'absolute',
                        left: `${f.x_pct}%`, top: `${f.y_pct}%`,
                        width: `${f.width_pct}%`, height: `${f.height_pct}%`,
                        boxSizing: 'border-box',
                        cursor: pendingType ? 'crosshair' : 'grab',
                      }}
                      className={cn(
                        'border-2 rounded-sm overflow-visible flex flex-col px-1 py-0.5',
                        colorCls,
                        isSelected && 'ring-2 ring-offset-1 ring-brand-500'
                      )}
                      onMouseDown={e => startFieldMove(e, f.id)}
                      onClick={e => { e.stopPropagation(); setSelectedId(f.id) }}
                    >
                      <div className="flex items-start gap-1 flex-1 min-h-0">
                        <span className="flex-shrink-0 mt-0.5">{typeIcon(f.field_type)}</span>
                        <span className="text-xs font-medium truncate leading-tight flex-1">{f.field_label}</span>
                        {f.required && !isRef && <span className="text-red-500 font-bold text-xs flex-shrink-0">*</span>}
                        {isRef && <span className="text-amber-600 text-[9px] font-bold flex-shrink-0">AUTO</span>}
                      </div>

                      {/* Role badge */}
                      {showRoleBadges && !isRef && f.height_pct > 3 && (
                        <div className={cn(
                          'inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium w-fit border leading-none flex-shrink-0',
                          filledByPill(f.filled_by || 'initiator')
                        )}>
                          <Workflow size={7} />
                          {filledByLabel(f.filled_by || 'initiator')}
                        </div>
                      )}

                      {/* Reference preview label */}
                      {isRef && f.height_pct > 3 && (
                        <div className="text-[9px] text-amber-700 font-mono leading-none flex-shrink-0">
                          {(f.validation_rules?.ref_prefix || formDef?.code_suffix || 'REF')}-{'0'.repeat((f.validation_rules?.ref_padding || 4) - 1)}1
                        </div>
                      )}

                      {/* SE resize handle */}
                      {isSelected && (
                        <div
                          style={{ position: 'absolute', right: -5, bottom: -5, width: 10, height: 10, cursor: 'se-resize', zIndex: 10 }}
                          className="bg-white border-2 border-brand-500 rounded-sm"
                          onMouseDown={e => startFieldResize(e, f.id)}
                        />
                      )}
                    </div>
                  )
                })}

                {/* Draw preview */}
                {previewRect && (
                  <div
                    style={{ position: 'absolute', ...previewRect, boxSizing: 'border-box', pointerEvents: 'none' }}
                    className="border-2 border-brand-500 bg-brand-100/40 rounded-sm"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
