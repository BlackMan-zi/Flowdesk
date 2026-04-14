import React, { useState, useRef, useEffect, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import PDFPageCanvas from './PDFPageCanvas'
import { uploadPdfTemplate, getPdfTemplateBlob } from '../../api/forms'
import Button from '../ui/Button'
import {
  Type, Hash, Calendar, AlignLeft, ChevronDown, CheckSquare,
  PenTool, ChevronLeft, ChevronRight, Upload, Trash2, Save, X,
  DollarSign, Zap, Table2, Circle, Plus, HelpCircle
} from 'lucide-react'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

// ── Field type config ─────────────────────────────────────────────────────────

const FIELD_TYPES = [
  { type: 'text',       label: 'Text',        icon: Type        },
  { type: 'number',     label: 'Number',      icon: Hash        },
  { type: 'currency',   label: 'Currency',    icon: DollarSign  },
  { type: 'date',       label: 'Date',        icon: Calendar    },
  { type: 'textarea',   label: 'Paragraph',   icon: AlignLeft   },
  { type: 'dropdown',   label: 'Dropdown',    icon: ChevronDown },
  { type: 'radio',      label: 'Radio',       icon: Circle      },
  { type: 'checkbox',   label: 'Checkbox',    icon: CheckSquare },
  { type: 'calculated', label: 'Calculated',  icon: Zap         },
  { type: 'table',      label: 'Table/Grid',  icon: Table2      },
  { type: 'signature',  label: 'Signature',   icon: PenTool     },
]

// ── Filled-by config ──────────────────────────────────────────────────────────

const FILLED_BY_OPTIONS = [
  { value: 'initiator',    label: 'Initiator',         color: 'border-blue-500   bg-blue-50/80   text-blue-800'   },
  { value: 'line_manager', label: 'Line Manager',      color: 'border-violet-500 bg-violet-50/80 text-violet-800' },
  { value: 'sn_manager',   label: "Manager's Manager", color: 'border-indigo-500 bg-indigo-50/80 text-indigo-800' },
  { value: 'hod',          label: 'Head of Dept',      color: 'border-amber-500  bg-amber-50/80  text-amber-800'  },
  { value: 'any',          label: 'Any / Shared',      color: 'border-slate-400  bg-slate-50/80  text-slate-700'  },
]

function filledByColor(filledBy) {
  return FILLED_BY_OPTIONS.find(o => o.value === filledBy)?.color
    || 'border-blue-500 bg-blue-50/80 text-blue-800'
}

function typeIcon(type) {
  const cfg = FIELD_TYPES.find(t => t.type === type)
  if (!cfg) return null
  const Icon = cfg.icon
  return <Icon size={11} />
}

// ── Tag-based options input ───────────────────────────────────────────────────

function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState('')

  const addTag = (val) => {
    const trimmed = val.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(input) }
    if (e.key === 'Backspace' && !input && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="border border-slate-300 rounded p-1.5 flex flex-wrap gap-1 focus-within:ring-1 focus-within:ring-brand-500 bg-white">
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-1 bg-brand-100 text-brand-800 text-xs px-1.5 py-0.5 rounded">
          {t}
          <button type="button" onClick={() => onChange(tags.filter(x => x !== t))} className="hover:text-brand-900">
            <X size={9} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addTag(input) }}
        placeholder={tags.length ? '' : placeholder}
        className="flex-1 min-w-[80px] text-xs outline-none bg-transparent py-0.5"
      />
    </div>
  )
}

// ── Tooltip helper ────────────────────────────────────────────────────────────

function Tip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex ml-1 align-middle" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
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
  const addCol = () => onChange([...cols, { key: `col${cols.length + 1}`, label: `Column ${cols.length + 1}`, type: 'text', formula: '' }])
  const removeCol = (i) => onChange(cols.filter((_, idx) => idx !== i))
  const updateCol = (i, patch) => onChange(cols.map((c, idx) => idx === i ? { ...c, ...patch } : c))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">Table Columns</span>
        <button onClick={addCol} className="text-brand-600 hover:text-brand-800 flex items-center gap-0.5 text-xs">
          <Plus size={11} /> Add
        </button>
      </div>
      {cols.map((col, i) => (
        <div key={i} className="bg-slate-50 border border-slate-200 rounded p-2 space-y-1">
          <div className="flex gap-1">
            <input type="text" value={col.label} onChange={e => updateCol(i, { label: e.target.value })} placeholder="Label"
              className="flex-1 text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400" />
            <input type="text" value={col.key} onChange={e => updateCol(i, { key: e.target.value.toLowerCase().replace(/\s+/g, '_') })} placeholder="key"
              className="w-20 text-xs border border-slate-200 rounded px-1.5 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-brand-400" />
            <button onClick={() => removeCol(i)} className="text-red-400 hover:text-red-600 px-1"><X size={12} /></button>
          </div>
          <div className="flex gap-1">
            <select value={col.type} onChange={e => updateCol(i, { type: e.target.value })}
              className="flex-1 text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none">
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="currency">Currency</option>
              <option value="date">Date</option>
              <option value="calculated">Calculated</option>
            </select>
            {col.type === 'calculated' && (
              <input type="text" value={col.formula || ''} onChange={e => updateCol(i, { formula: e.target.value })} placeholder="qty * price"
                className="flex-1 text-xs border border-slate-200 rounded px-1.5 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-brand-400" />
            )}
          </div>
        </div>
      ))}
      {cols.length === 0 && <p className="text-xs text-slate-400 italic">No columns yet</p>}
    </div>
  )
}

// ── Field properties panel ────────────────────────────────────────────────────

function FieldProperties({ field, onChange, onDelete }) {
  if (!field) return (
    <div className="text-xs text-slate-400 text-center py-6 px-3">
      Click a field on the PDF to edit its properties
    </div>
  )

  const rules = field.validation_rules || {}
  const setRule = (key, val) => onChange({ validation_rules: { ...rules, [key]: val || undefined } })
  const hasOptions = ['dropdown', 'checkbox', 'radio'].includes(field.field_type)

  return (
    <div className="p-3 space-y-3 text-xs overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Properties</p>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
      </div>

      {/* Label */}
      <label className="block">
        <span className="font-medium text-slate-600 block mb-1">
          Label
          <Tip text="Shown to the person filling the form. Example: 'Employee Name'" />
        </span>
        <input type="text" value={field.field_label}
          onChange={e => onChange({ field_label: e.target.value })}
          className="w-full border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </label>

      {/* Field name */}
      <label className="block">
        <span className="font-medium text-slate-600 block mb-1">
          Field name
          <Tip text="Internal system key used in formulas (e.g. qty * unit_price). Auto-generated; keep it lowercase with underscores." />
        </span>
        <input type="text" value={field.field_name}
          onChange={e => onChange({ field_name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
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

      {/* Filled by */}
      <label className="block">
        <span className="font-medium text-slate-600 block mb-1">
          Filled by
          <Tip text="Defines which role is responsible for completing this field. This drives color-coding and workflow routing." />
        </span>
        <select value={field.filled_by || 'initiator'} onChange={e => onChange({ filled_by: e.target.value })}
          className="w-full border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500">
          {FILLED_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>

      {/* Options */}
      {hasOptions && (
        <label className="block">
          <span className="font-medium text-slate-600 block mb-1">Options
            <Tip text="Press Enter after each option. Click × to remove." />
          </span>
          <TagInput
            tags={Array.isArray(field.options) ? field.options : []}
            onChange={opts => onChange({ options: opts })}
            placeholder="Type option, press Enter…"
          />
        </label>
      )}

      {/* Formula */}
      {field.field_type === 'calculated' && (
        <label className="block">
          <span className="font-medium text-slate-600 block mb-1">
            Formula
            <Tip text="Use field_name tokens and operators. E.g.: qty * unit_price. Use SUM(items.amount) to sum a table column." />
          </span>
          <input type="text" value={field.calculation_formula || ''}
            onChange={e => onChange({ calculation_formula: e.target.value })}
            placeholder="e.g. qty * unit_price"
            className="w-full border border-slate-300 rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </label>
      )}

      {/* Table columns */}
      {field.field_type === 'table' && (
        <TableColumnManager columns={field.table_columns} onChange={cols => onChange({ table_columns: cols })} />
      )}

      {/* Default value */}
      {!['signature', 'table'].includes(field.field_type) && (
        <label className="block">
          <span className="font-medium text-slate-600 block mb-1">Default value</span>
          <input type="text" value={field.default_value || ''}
            onChange={e => onChange({ default_value: e.target.value || null })}
            placeholder="Pre-filled value…"
            className="w-full border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </label>
      )}

      {/* Validation */}
      {['text', 'textarea', 'number', 'currency'].includes(field.field_type) && (
        <div className="space-y-1.5">
          <span className="font-medium text-slate-600 flex items-center">
            Validation
            <Tip text="Prevent incorrect entries. Min/max restrict numeric range. Min/max length restrict text length. Pattern enforces a specific format (regex)." />
          </span>
          {['number', 'currency'].includes(field.field_type) && (
            <div className="flex gap-1.5">
              <label className="flex-1">
                <span className="text-slate-500 block mb-0.5">Min</span>
                <input type="number" value={rules.min ?? ''} onChange={e => setRule('min', e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400" />
              </label>
              <label className="flex-1">
                <span className="text-slate-500 block mb-0.5">Max</span>
                <input type="number" value={rules.max ?? ''} onChange={e => setRule('max', e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400" />
              </label>
            </div>
          )}
          {['text', 'textarea'].includes(field.field_type) && (
            <div className="flex gap-1.5">
              <label className="flex-1">
                <span className="text-slate-500 block mb-0.5">Min length</span>
                <input type="number" value={rules.min_length ?? ''} onChange={e => setRule('min_length', e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none" />
              </label>
              <label className="flex-1">
                <span className="text-slate-500 block mb-0.5">Max length</span>
                <input type="number" value={rules.max_length ?? ''} onChange={e => setRule('max_length', e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none" />
              </label>
            </div>
          )}
          <label className="block">
            <span className="text-slate-500 flex items-center mb-0.5">
              Pattern (regex)
              <Tip text="A regular expression the value must match. Examples: '^[A-Z]{2}-\d{4}$' for codes like AB-1234. Leave blank if not needed." />
            </span>
            <input type="text" value={rules.pattern ?? ''} onChange={e => setRule('pattern', e.target.value)}
              placeholder="^[A-Z]{3}-\d+$"
              className="w-full border border-slate-200 rounded px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-brand-400" />
          </label>
        </div>
      )}

      {/* Toggles */}
      <div className="space-y-1.5 border-t border-slate-100 pt-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={field.required} onChange={e => onChange({ required: e.target.checked })} className="rounded" />
          <span className="text-slate-700">Required <span className="text-red-500">*</span></span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={field.read_only || false} onChange={e => onChange({ read_only: e.target.checked })} className="rounded" />
          <span className="text-slate-700">Read-only</span>
        </label>
      </div>

      {/* Position info */}
      <div className="text-slate-400 border-t border-slate-100 pt-2 space-y-0.5">
        <p>Page {field.page_number} · X: {field.x_pct?.toFixed(1)}% Y: {field.y_pct?.toFixed(1)}%</p>
        <p>W: {field.width_pct?.toFixed(1)}% H: {field.height_pct?.toFixed(1)}%</p>
      </div>
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function FilledByLegend() {
  return (
    <div className="px-3 py-2 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Color legend</p>
      <div className="space-y-1">
        {FILLED_BY_OPTIONS.map(o => (
          <div key={o.value} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded border-2 flex-shrink-0 ${o.color.split(' ').find(c => c.startsWith('border-'))} ${o.color.split(' ').find(c => c.startsWith('bg-'))}`} />
            <span className="text-xs text-slate-600">{o.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main builder component ────────────────────────────────────────────────────

export default function PDFFormBuilder({ formDef, initialFields = [], onSave, onBack, onDelete }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [containerWidth, setContainerWidth] = useState(0)
  const [fields, setFields] = useState(initialFields)
  const [selectedId, setSelectedId] = useState(null)
  const [pendingType, setPendingType] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Interaction state
  const [drawDrag, setDrawDrag]     = useState(null)   // rubber-band new field
  const [moveDrag, setMoveDrag]     = useState(null)   // dragging existing field
  const [resizeDrag, setResizeDrag] = useState(null)   // resizing selected field

  const containerRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width))
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!formDef?.pdf_template_path) return
    let blobUrl = null
    getPdfTemplateBlob(formDef.id).then(async res => {
      blobUrl = URL.createObjectURL(res.data)
      const doc = await pdfjsLib.getDocument(blobUrl).promise
      setPdfDoc(doc)
      setNumPages(doc.numPages)
    }).catch(() => {})
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [formDef?.id])

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadPdfTemplate(formDef.id, file)
      const url = URL.createObjectURL(file)
      const doc = await pdfjsLib.getDocument(url).promise
      setPdfDoc(doc)
      setNumPages(doc.numPages)
      setCurrentPage(1)
    } catch {
      alert('PDF upload failed. Please try again.')
    }
    setUploading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = fields.map((f, idx) => ({
        ...(f._isNew ? {} : { id: f.id }),
        field_name:          f.field_name || `field_${idx + 1}`,
        field_label:         f.field_label || `Field ${idx + 1}`,
        field_type:          f.field_type,
        required:            f.required,
        options:             f.options || null,
        placeholder:         f.placeholder || null,
        display_order:       idx,
        page_number:         f.page_number,
        x_pct:               f.x_pct,
        y_pct:               f.y_pct,
        width_pct:           f.width_pct,
        height_pct:          f.height_pct,
        default_value:       f.default_value || null,
        read_only:           f.read_only || false,
        validation_rules:    f.validation_rules || null,
        calculation_formula: f.calculation_formula || null,
        table_columns:       f.table_columns || null,
        filled_by:           f.filled_by || 'initiator',
      }))
      await onSave(payload)
    } finally {
      setSaving(false)
    }
  }

  // ── Coordinate helpers ──────────────────────────────────────────────────────

  const getRelativePos = useCallback((e) => {
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: Math.min(100, Math.max(0, (e.clientX - rect.left) / rect.width * 100)),
      y: Math.min(100, Math.max(0, (e.clientY - rect.top) / rect.height * 100)),
    }
  }, [])

  // ── mousedown: start draw OR start move ────────────────────────────────────

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    const { x, y } = getRelativePos(e)

    if (pendingType) {
      // Start rubber-band draw
      e.preventDefault()
      setDrawDrag({ startX: x, startY: y, currentX: x, currentY: y })
      return
    }

    // Check if we hit a field (handled by field's own onMouseDown)
    // Nothing to do here if no pendingType
    setSelectedId(null)
  }, [pendingType, getRelativePos])

  const startFieldMove = useCallback((e, fieldId) => {
    e.stopPropagation()  // always prevent container from starting a draw
    if (pendingType) return
    e.preventDefault()
    const { x, y } = getRelativePos(e)
    const field = fields.find(f => f.id === fieldId)
    if (!field) return
    setSelectedId(fieldId)
    setMoveDrag({ fieldId, startX: x, startY: y, origX: field.x_pct, origY: field.y_pct })
  }, [pendingType, fields, getRelativePos])

  const startFieldResize = useCallback((e, fieldId) => {
    e.preventDefault()
    e.stopPropagation()
    const { x, y } = getRelativePos(e)
    const field = fields.find(f => f.id === fieldId)
    if (!field) return
    setResizeDrag({
      fieldId,
      startX: x, startY: y,
      origX: field.x_pct, origY: field.y_pct,
      origW: field.width_pct, origH: field.height_pct,
    })
  }, [fields, getRelativePos])

  // ── mousemove ──────────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e) => {
    const { x, y } = getRelativePos(e)

    if (drawDrag) {
      setDrawDrag(d => d ? { ...d, currentX: x, currentY: y } : null)
      return
    }

    if (moveDrag) {
      const dx = x - moveDrag.startX
      const dy = y - moveDrag.startY
      setFields(fs => fs.map(f => f.id === moveDrag.fieldId ? {
        ...f,
        x_pct: Math.min(100 - f.width_pct, Math.max(0, moveDrag.origX + dx)),
        y_pct: Math.min(100 - f.height_pct, Math.max(0, moveDrag.origY + dy)),
      } : f))
      return
    }

    if (resizeDrag) {
      const dw = x - resizeDrag.startX
      const dh = y - resizeDrag.startY
      setFields(fs => fs.map(f => f.id === resizeDrag.fieldId ? {
        ...f,
        width_pct:  Math.max(2, resizeDrag.origW + dw),
        height_pct: Math.max(1, resizeDrag.origH + dh),
      } : f))
    }
  }, [drawDrag, moveDrag, resizeDrag, getRelativePos])

  // ── mouseup ────────────────────────────────────────────────────────────────

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
        setFields(fs => [...fs, {
          id: tempId, _isNew: true,
          field_name:  `field_${fields.length + 1}`,
          field_label: `${FIELD_TYPES.find(t => t.type === pendingType)?.label} ${fieldCount + 1}`,
          field_type:  pendingType,
          required: true,
          options: null, placeholder: null,
          default_value: null, read_only: false,
          validation_rules: null, calculation_formula: null,
          table_columns: pendingType === 'table'
            ? [{ key: 'col1', label: 'Column 1', type: 'text', formula: '' }]
            : null,
          filled_by: 'initiator',
          page_number: currentPage,
          x_pct: x0, y_pct: y0, width_pct: w, height_pct: h,
        }])
        setSelectedId(tempId)
        setPendingType(null)
      }
    }
    setDrawDrag(null)
    setMoveDrag(null)
    setResizeDrag(null)
  }, [drawDrag, pendingType, fields, currentPage, getRelativePos])

  const updateField  = (id, changes) => setFields(fs => fs.map(f => f.id === id ? { ...f, ...changes } : f))
  const deleteField  = (id) => { setFields(fs => fs.filter(f => f.id !== id)); setSelectedId(null) }

  const selectedField = fields.find(f => f.id === selectedId) || null
  const pageFields    = fields.filter(f => f.page_number === currentPage)

  const previewRect = drawDrag ? {
    left: `${Math.min(drawDrag.startX, drawDrag.currentX)}%`,
    top:  `${Math.min(drawDrag.startY, drawDrag.currentY)}%`,
    width:  `${Math.abs(drawDrag.currentX - drawDrag.startX)}%`,
    height: `${Math.abs(drawDrag.currentY - drawDrag.startY)}%`,
  } : null

  return (
    <div className="flex flex-col h-screen bg-slate-100" style={{ userSelect: 'none' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <ChevronLeft size={16} /> Back
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <p className="text-sm font-semibold text-slate-800 flex-1 truncate">{formDef?.name} — Layout Designer</p>

        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handlePdfUpload} />
        <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} loading={uploading}>
          <Upload size={13} className="mr-1.5" /> {formDef?.pdf_template_path ? 'Replace PDF' : 'Upload PDF'}
        </Button>
        <Button size="sm" onClick={handleSave} loading={saving} disabled={!pdfDoc}>
          <Save size={13} className="mr-1.5" /> Save & Return
        </Button>
        {onDelete && (
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-red-500 hover:text-red-700 ml-2">
            <Trash2 size={13} className="mr-1.5" /> Delete Form
          </Button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">

        {/* ── Left panel ── */}
        <div className="w-56 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">

          {/* Add field buttons */}
          <div className="p-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Add Field</p>
            <div className="space-y-0.5">
              {FIELD_TYPES.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  onClick={() => setPendingType(pt => pt === type ? null : type)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${
                    pendingType === type ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
            {pendingType && (
              <p className="text-xs text-brand-600 mt-2 font-medium animate-pulse">
                Draw a box on the PDF →
              </p>
            )}
          </div>

          {/* Page navigation */}
          {numPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                className="p-1 disabled:opacity-30 hover:bg-slate-100 rounded"><ChevronLeft size={14} /></button>
              <span className="text-xs text-slate-600">Page {currentPage} / {numPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}
                className="p-1 disabled:opacity-30 hover:bg-slate-100 rounded"><ChevronRight size={14} /></button>
            </div>
          )}

          {/* Field list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {pageFields.length > 0 && (
              <div className="p-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-1">Page {currentPage} fields</p>
                {pageFields.map(f => (
                  <button key={f.id} onClick={() => setSelectedId(f.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
                      selectedId === f.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    {typeIcon(f.field_type)}
                    <span className="flex-1 truncate">{f.field_label}</span>
                    {f.required && <span className="text-red-400 font-bold text-xs">*</span>}
                  </button>
                ))}
              </div>
            )}

            <FieldProperties
              field={selectedField}
              onChange={changes => updateField(selectedId, changes)}
              onDelete={() => deleteField(selectedId)}
            />
          </div>

          <FilledByLegend />
        </div>

        {/* ── PDF canvas ── */}
        <div className="flex-1 overflow-auto bg-slate-200 flex justify-center p-6">
          {!pdfDoc ? (
            <div className="flex flex-col items-center justify-center gap-4 text-center">
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
            </div>
          ) : (
            <div className="shadow-xl">
              <div
                ref={containerRef}
                style={{
                  position: 'relative',
                  width: Math.min(containerWidth || 800, 800),
                  cursor: pendingType ? 'crosshair' : (moveDrag ? 'grabbing' : 'default'),
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { if (drawDrag) setDrawDrag(null); if (moveDrag) setMoveDrag(null); if (resizeDrag) setResizeDrag(null) }}
              >
                <PDFPageCanvas
                  pdfDoc={pdfDoc}
                  pageNum={currentPage}
                  containerWidth={Math.min(containerWidth || 800, 800)}
                />

                {/* Field overlays */}
                {pageFields.map(f => {
                  const isSelected = selectedId === f.id
                  const colorCls = filledByColor(f.filled_by || 'initiator')

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
                      className={`border-2 ${colorCls} rounded-sm overflow-visible flex items-start gap-1 px-1 py-0.5 ${
                        isSelected ? 'ring-2 ring-offset-1 ring-brand-500' : ''
                      }`}
                      onMouseDown={e => startFieldMove(e, f.id)}
                      onClick={e => { e.stopPropagation(); setSelectedId(f.id) }}
                    >
                      <span className="flex-shrink-0 mt-0.5">{typeIcon(f.field_type)}</span>
                      <span className="text-xs font-medium truncate leading-tight flex-1">{f.field_label}</span>
                      {f.required && <span className="text-red-500 font-bold text-xs flex-shrink-0">*</span>}

                      {/* SE resize handle (visible only when selected) */}
                      {isSelected && (
                        <div
                          style={{ position: 'absolute', right: -5, bottom: -5, width: 10, height: 10,
                            cursor: 'se-resize', zIndex: 10 }}
                          className="bg-white border-2 border-brand-500 rounded-sm"
                          onMouseDown={e => startFieldResize(e, f.id)}
                        />
                      )}
                    </div>
                  )
                })}

                {/* Draw preview */}
                {previewRect && (
                  <div style={{ position: 'absolute', ...previewRect, boxSizing: 'border-box', pointerEvents: 'none' }}
                    className="border-2 border-brand-500 bg-brand-100/40 rounded-sm" />
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
